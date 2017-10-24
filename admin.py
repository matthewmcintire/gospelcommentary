
import requests, json, os, time, datetime, threading, re
import requests_toolbelt.adapters.appengine
import jinja2
import webapp2
import cloudstorage as gcs
from google.appengine.api import app_identity
from google.appengine.api import taskqueue
from google.appengine.api import users
from google.appengine.ext import ndb
requests_toolbelt.adapters.appengine.monkeypatch()

JINJA_ENVIRONMENT = jinja2.Environment(
    loader=jinja2.FileSystemLoader(os.path.dirname(__file__)),
    extensions=['jinja2.ext.autoescape'],
    autoescape=True)
bucket = '/'+os.environ.get('BUCKET_NAME',
                    app_identity.get_default_gcs_bucket_name())+'/'
INDEX = None
def verseNumber(x):
    return int(next(re.finditer(r'\d+$',x)).group(0))
def datetime_encoder(x):
    if isinstance(x, datetime.datetime):
        return int(time.mktime(x.timetuple())) * 1000
    raise TypeError("Unknown type")
def deleteFile(filename):
    gcs.delete(bucket+filename)
def deleteLog(filename):
    deleteFile('logs/'+filename+'.log')
def loadFile(filename):
    gcs_file = gcs.open(bucket+filename)
    text = gcs_file.read()
    gcs_file.close()
    return text
def loadLog(filename):
    return loadFile('logs/'+filename+'.log')
def saveLog(filename,text):
    try:
        previous = loadLog(filename)
    except:
        previous = ''
    text = str(datetime.datetime.now())+'\n'+str(text)+'\n'+previous
    saveFile('logs/'+filename+'.log',str(text),'text/plain')
def saveJSON(filename,obj,public=True):
    if public:
        acl = 'public-read'
    else:
        acl = 'project-private'
    text = json.dumps(obj)
    saveFile(filename+'.json',text,'application/json',acl)
def saveFile(filename,text,content_type,acl='project-private'):
    write_retry_params = gcs.RetryParams(backoff_factor=1.1)
    gcs_file = gcs.open(bucket+filename,
                        'w',
                        content_type=content_type,
                        options={'x-goog-acl': acl},
                        retry_params=write_retry_params)
    gcs_file.write(text)
    gcs_file.close()
def loadJSON(filename):
    return json.loads(loadFile(filename+'.json'))
KEYS = loadJSON('keys')
class Admin(webapp2.RequestHandler):
    def get(self):
        text = '<p><a href="updatescripture">Update Scripture</a></p>'
        text += '<p><a href="viewlog?filename=update">View Update Log</a></p>'
        text += '<p><a href="makeindex">Make Scripture Index</a></p>'
        self.write(text)
    def write(self,text=""):
        template_values = {'text': jinja2.Markup(text)}
        template = JINJA_ENVIRONMENT.get_template('admin.html')
        self.response.write(template.render(template_values))
class UpdateScripture(Admin):
    def get(self):
        task = taskqueue.add(url='/admin/updatescripture')
        text = 'Task {} enqueued, ETA {}.'.format(task.name, task.eta)
        text = '<p><a href="login">Return to Admin</a></p>'+text
        self.write(text)
    def post(self):
        self.text = []
        def getPage(filename):
            for _ in range(100):
                try:
                    self.text.append('Getting '+filename)
                    page = requests.get('https://bibles.org/v2/'+filename,auth=(
                        KEYS["bibles"],'X'),timeout=5)
                    break
                except:
                    self.text.append('Trying again in 1 second.')
                    time.sleep(1)
            else:
                raise
            return page.json()['response']
        def onBlacklist(string):
            blacklist = ['cevd','tobit','judith','wisdom','sirach','baruch','letter',
                 'maccabees','esdras','manasseh','dragon','additions','susanna',
                 'children','ecclesiasticus','(greek)','three young men']
            for word in blacklist: 
                if word in string.lower():
                    return True
            return False
        def worker(filename,pagename):
            page = getPage(pagename)['chapters'][0]
            saveJSON(filename,page)
        try:
            revs = loadJSON('revs')
        except:
            revs = {}
        try:
            saved_versions = loadJSON('versions')
        except:
            saved_versions = {}
        versions = getPage('versions.js?language=eng-US')['versions']
        versions = {v['id']:v for v in versions if not onBlacklist(v['id'])}
        threads = []
        for version in versions:
            try:
                rev = revs[version]['rev']
            except KeyError:
                self.text.append('New version '+version)
                revs[version] = {'date':'0'}
                rev = 0
                v = versions[version]
                saved_versions[version] = {k:v[k] for k in ('name','abbreviation')}
            if versions[version]['updated_at'] == revs[version]['date']:
                self.text.append('Latest '+version)
                continue
            self.text.append('Outdated '+version)
            rev += 1
            rev_dir = version+'-r'+str(rev)
            saved_versions[version]['dir'] = rev_dir
            revs[version]['rev'] = rev
            revs[version]['date'] = versions[version]['updated_at']
            books = getPage('versions/'+version+'/books.js')['books']
            bookList = [b['abbr'] for b in books if not onBlacklist(b['name'])]
            books = {b['abbr']:{'id':b['id'],'name':b['name']} for b in books if not onBlacklist(b['name'])}
            for book in books:
                path = 'scripture/'+rev_dir+'/'+book
                chapters = getPage('books/'+books[book]['id']+'/chapters.js')['chapters']
                books[book]['chapters'] = [c['chapter'] for c in chapters]
                for chapter in chapters:
                    filename = path+'/'+version+'.'+book+'.'+chapter['chapter']
                    pagename = 'chapters/'+chapter['id']+'.js'
                    t = threading.Thread(target=worker, args=(filename,pagename))
                    threads.append(t)
                    t.start()
            books = {b:{'name':books[b]['name'],'chapters':books[b]['chapters']} for b in books}
            books['ordered'] = bookList
            saveJSON('scripture/'+rev_dir+'/books',books)
            saveJSON('versions',saved_versions)
            saveJSON('revs',revs,public=False)
            self.text = '\n'.join(self.text)+'\n'
            saveLog('update', self.text)
            self.text = []
        for t in threads:
            t.join()
        if len(self.text):
            self.text = '\n'.join(self.text)+'\n'
            saveLog('update', self.text)
class AddCommentary(webapp2.RequestHandler):
    def post(self):
        '''Will run one at a time. Process entries to .json'''
        pass
class MakeIndex(Admin):
    def get(self):
        task = taskqueue.add(url='/admin/makeindex')
        text = 'Task {} enqueued, ETA {}.'.format(task.name, task.eta)
        text = '<p><a href="login">Return to Admin</a></p>'+text
        self.write(text)
    def post(self):
        versions = loadJSON('versions')
        directory = versions["eng-NASB"]["dir"]
        books = loadJSON('scripture/'+directory+'/books')
        index = {}
        for book in books['ordered']:
            index[book] = {}
            for chapter in books[book]["chapters"]:
                data = loadJSON('scripture/'+directory+'/'+book+'/eng-NASB.'+book+'.'+chapter)
                index[book][chapter] = int(next(re.finditer(r'\d+$',data["osis_end"])).group(0))
        saveJSON('index', index, public=False)
class ViewLog(Admin):
    def get(self):
        filename = self.request.get('filename')
        text = '<p><a href="login">Return to Admin</a></p>'
        text += '<p><a href="clearlog?filename='+filename+'">Clear Log: '+filename+'</a></p>'
        try:
            text += '<pre>'+loadLog(filename)+'</pre>'
        except:
            text += '<p>Unable to load log.</p>'
        self.write(text)
class ClearLog(Admin):
    def get(self):
        text = '<p><a href="login">Return to Admin</a></p>'
        filename = self.request.get('filename')
        try:
            deleteLog(filename)
            text += '<p>Log cleared.</p>'
        except:
            text += '<p>Unable to clear log.</p>'
        self.write(text)
class Commentary(ndb.Model):
    book = ndb.StringProperty()
    chapter = ndb.StringProperty()
    end_chapter = ndb.StringProperty()
    verse = ndb.StringProperty()
    end_verse = ndb.StringProperty()
    html = ndb.TextProperty(repeated=True)
    date = ndb.DateTimeProperty(indexed=False,repeated=True)
    published = ndb.DateTimeProperty()
    editor = ndb.StringProperty(repeated=True)
    def verify(self):
        global INDEX
        if INDEX is None:
            INDEX = loadJSON("index")
        try:
            if (verseNumber(self.verse) <= INDEX[self.book][self.chapter] and
                verseNumber(self.end_verse) <= INDEX[self.book][self.end_chapter] and
                ((int(self.chapter) == int(self.end_chapter) and
                  verseNumber(self.verse) <= verseNumber(self.end_verse)) or
                 int(self.chapter) < int(self.end_chapter))):
                return True
        except:
            raise
        return False
class User(ndb.Model):
    name = ndb.StringProperty(indexed=False)
    email = ndb.StringProperty(indexed=False)
    groups = ndb.StringProperty(repeated=True,indexed=False)
    current = ndb.StringProperty(indexed=False)
    requests = ndb.BooleanProperty(indexed=False,default=False)
    time = ndb.DateTimeProperty(indexed=False,auto_now=True)
    level = ndb.IntegerProperty(default=0)
class Name(ndb.Model):
    group = ndb.BooleanProperty(default=False)
    members = ndb.KeyProperty(kind=User,repeated=True)
    requests = ndb.KeyProperty(kind=User,repeated=True)
    locked = ndb.BooleanProperty(indexed=False,default=False)
    commentaries = ndb.KeyProperty(kind=Commentary,repeated=True)
@ndb.transactional
def insert_if_absent(entity):
    fetch = entity.key.get()
    if fetch is None:
        entity.put()
        return entity
    return False
@ndb.transactional
def insert_if_not_updated(entity):
    fetch = entity.key.get()
    if fetch.time == entity.time:
        entity.put_async()
        return True
    return False
@ndb.transactional
def append_request(entity,request):
    fetch = entity.key.get()
    if not request in fetch.requests:
        fetch.requests.append(request)
        fetch.put()
    return fetch
def getUser():
    uid = users.get_current_user().user_id()
    email = users.get_current_user().email()
    user = ndb.Key(User,uid).get()
    if user:
        if email != user.email:
            user.email = email
            user.put_async()
    else:
        user = User(id=uid,email=email)
        name = users.get_current_user().nickname()
        inserted = insert_if_absent(Name(id=name,members=[user.key]))
        i = 0
        while not inserted:
            i += 1
            inserted = insert_if_absent(Name(id=name+str(i),members=[user.key]))
        user.name = inserted.key.id()
        user.current = user.name
        user.put_async()
    return user
class GetUser(webapp2.RequestHandler):
    def get(self):
        user = getUser()
        requests = []
        if user.requests:
            for group in user.groups:
                for requester in ndb.get_multi(ndb.Key(Name,group).get().requests):
                    requests.append({"name":requester.name,
                                     "email":requester.email,
                                     "group":group,
                                     "uid":requester.key.id()})
            if not requests:
                user.requests = False
                insert_if_not_updated(user)
        obj = {"name":user.name,
               "email":user.email,
               "groups":user.groups,
               "current":user.current,
               "requests":requests}
        commentaries = []
        name_key = ndb.Key(Name,user.current)
        name = name_key.get()
        for c in ndb.get_multi(name.commentaries):
            commentaries.append(c.to_dict())
        obj["commentaries"] = commentaries
        self.response.headers['Content-Type'] = 'application/json' 
        self.response.write(json.dumps(obj,default=datetime_encoder))
class ChangeUserName(webapp2.RequestHandler):
    def post(self):
        user = getUser()
        name = self.request.get("name").strip()
        if len(name)<2:
            state = "invalid"
        elif not insert_if_absent(Name(id=name,
                                       members=[user.key],
                                       commentaries=ndb.Key(Name,user.name).get().commentaries)):
            state = "taken"
        else:
            old_name = user.name
            ndb.Key(Name,old_name).delete_async()
            user.name = name
            user.current = name
            user.put_async()
            taskqueue.add(
                url='/admin/updateusername',
                params={'old_name': old_name,'name': name})
            state = "changed"
        self.response.headers['Content-Type'] = 'application/json' 
        self.response.write(json.dumps({"state":state,"name":name}))
        #fire request to queue to rename all user commentaries
class CreateGroup(webapp2.RequestHandler):
    def post(self):
        user = getUser()
        group_name = self.request.get("group").strip()
        if len(group_name)<2:
            state = "invalid"
        elif insert_if_absent(Name(id=group_name,group=True,members=[user.key])):
            user.groups.append(group_name)
            user.current = group_name
            user.put_async()
            state = "created"
        else:
            state = "taken"
        self.response.headers['Content-Type'] = 'application/json' 
        self.response.write(json.dumps({"state":state,"group":group_name}))
class JoinGroup(webapp2.RequestHandler):
    def post(self):
        user = getUser()
        group_name = self.request.get("group").strip()
        if group_name in user.groups:
            state = "member"
        elif len(group_name)<2:
            state = "not a group"
        else:
            group = ndb.Key(Name,group_name).get()
            if not group or not group.group:
                state = "not a group"
            elif group.locked:
                state = "locked"
            else:
                group = append_request(group,user.key)
                for member_key in group.members:
                    member = member_key.get()
                    member.requests = True
                    member.put_async()
                state = "requested"
        self.response.headers['Content-Type'] = 'application/json' 
        self.response.write(json.dumps({"state":state,"group":group_name}))
@ndb.transactional(xg=True)
def resolve_request(group_key,requester_key,accept):
    group = group_key.get()
    if requester_key in group.requests:
        group.requests.remove(requester_key)
        if accept:
            group.members.append(requester_key)
            requester = requester_key.get()
            requester.groups.append(group)
            requester.put()
        group.put()
        return True
    return False
class MembershipResponse(webapp2.RequestHandler):
    def post(self):
        user = getUser()
        group_name = self.request.get("group")
        if not group_name in user.groups:
            self.error(403)
            return
        accept = self.request.get("accept")
        
        if resolve_request(ndb.Key(Name,group_name),
                           ndb.Key(User,self.request.get("uid")),
                           accept):
            if accept:
                state = "accepted"
            else:
                state = "rejected"
        else:
            state = "not found"
        self.response.headers['Content-Type'] = 'application/json' 
        self.response.write(json.dumps({"state":state,
                                        "group":group_name,
                                        "name":self.request.get("name")}))
class ContributeAs(webapp2.RequestHandler):
    def post(self):
        user = getUser()
        name = self.request.get("name")
        if name==user.name or name in user.groups:
            user.current = name
            user.put_async()
            state = "accepted"
        else:
            state = "rejected"
        self.response.headers['Content-Type'] = 'application/json' 
        self.response.write(json.dumps({"state":state,
                                        "name":name}))
@ndb.transactional(xg=True)
def insert_or_update(name_key,new):
    commentary = new.key.get()
    if commentary:
        commentary.html.extend(new.html)
        commentary.date.extend(new.date)
        commentary.editor.extend(new.editor)
        commentary.put()
    else:
        new.put_async()
        group = name_key.get()
        group.commentaries.append(new.key)
        group.put()
class EditCommentary(webapp2.RequestHandler):
    def post(self):
        user = getUser()
        name = user.current
        commentary = Commentary(id=name+
                                self.request.get("verse")+
                                self.request.get("endVerse"),
                                book=self.request.get("book"),
                                chapter=self.request.get("chapter"),
                                verse=self.request.get("verse"),
                                end_chapter=self.request.get("endChapter"),
                                end_verse=self.request.get("endVerse"),
                                html=[self.request.get("html")],
                                date=[datetime.datetime.now()],
                                editor=[user.name])
        if commentary.verify():
            insert_or_update(ndb.Key(Name,name), commentary)
            state = "successful"
        else:
            state = "error"
        self.response.headers['Content-Type'] = 'application/json' 
        self.response.write(json.dumps({"state":state,"date":commentary.date[-1]},
                                       default=datetime_encoder))
app = ndb.toplevel(webapp2.WSGIApplication([
    ('/admin/login', Admin),
    ('/admin/updatescripture', UpdateScripture),
    ('/admin/makeindex', MakeIndex),
    ('/admin/viewlog', ViewLog),
    ('/admin/clearlog', ClearLog),
    ('/user/getuser', GetUser),
    ('/user/changeusername', ChangeUserName),
    ('/user/creategroup', CreateGroup),
    ('/user/joingroup', JoinGroup),
    ('/user/respond', MembershipResponse),
    ('/user/contributeas',ContributeAs),
    ('/user/editcommentary', EditCommentary),
    ('/user/addcommentary', AddCommentary)], debug=True))