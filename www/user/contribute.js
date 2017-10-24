var endChapters;
var endChapter;
var endVerses;
var endVerse;
var requests;
var oldEdit;
var commentaries = [];
var autohash = false;
function dateString(x){
	d = new Date(x);
	return d.toString();
}
function getVersions(){
	commentaries_loading = $.Deferred();
	loadJSON("versions.json",saveVersions);
}
function saveVersions(file){
	versions = file;
	version = 'eng-NASB';
	if (!(versions.hasOwnProperty(version))){
		version = Object.keys(versions)[0];
	}
	if (verse == undefined){
		if (localStorage.book){
			setBook(localStorage.book);
		}
		if (localStorage.chapter){
			chapter = localStorage.chapter;
		}
	}
	getBooks();
}
function choose(id,l,v,f){
	if (f == undefined){
		f = function(x){return x;};
	}
	var t = '';
	for (var i=0;i<l.length;i++){
		var x = l[i];
		var y = f(x);
		var s = '';
		if (x == v){
			s = ' selected';
		}
		t += '<option value="'+x+'"'+s+'>'+y+'</option>';
	}
	$('#'+id).html(t);
}
function chooseBook(){
	choose('chooseBook',books.ordered,book,bookName);
}
function changeBook(){
	setBook(document.getElementById("chooseBook").value);
	chapter = endChapter = verse = endVerse = undefined;
	getChapters();
	localStorage.book = book;
}
function getChapters(){
	chapters = books[book].chapters;
	if (chapters.indexOf(chapter) == -1){
		chapter = chapters[chapters.indexOf("1")];
	}
	chooseChapter();
}
function chooseChapter(){
	choose('chooseChapter',chapters,chapter);
	getEndChapters();
}
function changeChapter(){
	chapter = $('#chooseChapter').val();
	if (!($('#multiple').is(':checked'))){
		endChapter = chapter;
	}
	verse = undefined;
	getEndChapters();
}
function getEndChapters(){
	endChapters = chapters.slice(chapters.indexOf(chapter));
	if (endChapters.indexOf(endChapter) == -1){
		endChapter = endChapters[0];
		endVerse = undefined;
	}
	chooseEndChapter();
}
function chooseEndChapter(){
	choose('chooseEndChapter',endChapters,endChapter);
	getScripture();
}
function changeEndChapter(){
	endChapter = $('#chooseEndChapter').val();
	getScripture();
}
function getScripture(){
	if (!($('#multiple').is(':checked'))){
		endChapter = chapter;
	}
	var passageChapters = chapters.slice(chapters.indexOf(chapter),chapters.indexOf(endChapter)+1);
	var path = "scripture/"+versions[version]['dir']+"/"+book+"/";
	var defs = [];
	for (var i=0;i<passageChapters.length;i++){
		var filename = version+"."+book+"."+passageChapters[i]+".json";
		defs.push(loadJSON(path+filename));
	}
	$.when.apply($,defs).done(displayScripture)
}
function displayScripture(){
	var text = '';
	if (chapter == endChapter){
		text = arguments[0].text;
	}else{
		for (var i=0;i<arguments.length;i++){
			text += arguments[i][0].text;
		}
	}
	$('#scripture').html(text);
	$('#scripture h3').remove();
	getVerses();
}
function versesFrom(c){
	var vs = [];
	var iBook = $('#scripture span').attr('class').replace(/^v(\d+).+/,'$1');
	$("#scripture span[class^='v"+iBook+"_"+c+"_']").each(function(){
		vs.push($(this).attr('class'));
		});
	return unique(vs);
}
function getVerses(){
	verses = versesFrom(chapter);
	if (verses.indexOf(verse) == -1){
		verse = verses[0];
	}
	chooseVerse();
}
function chooseVerse(){
	choose('chooseVerse',verses,verse,verseNumber);
	getEndVerses();
}
function getEndVerses(){
	if (chapter == endChapter){
		endVerses = verses.slice(verses.indexOf(verse));
	}else{
		endVerses = versesFrom(endChapter);
	}
	if (endVerses.indexOf(endVerse) == -1){
		endVerse = endVerses[0];
	}
	chooseEndVerse();
}
function chooseEndVerse(){
	choose('chooseEndVerse',endVerses,endVerse,verseNumber);
	setHash();
}
function changeVerse(){
	verse = $('#chooseVerse').val();
	if (!($('#multiple').is(':checked'))){
		endVerse = verse;
	}
	getEndVerses();
}
function changeEndVerse(){
	endVerse = $('#chooseEndVerse').val();
	setHash();
}
function setHash(){
	var hash = version+'_'+book+'_'+verse+'_'+endVerse;
	if (location.hash == '#'+hash){
		getPassage();
	}else{
		autohash = true;
		location.hash = hash;
	}
}
function getPassage(){
	$('#passage').empty();
	$('#scripture div').clone().appendTo('#passage');
	var $begin = $('#passage span.'+verse+':eq(0)');
	$begin.parent().prevAll().remove();
	$begin.prevAll().remove();
	var $end = $('#passage span.'+endVerse+':eq(-1)');
	$end.parent().nextAll().remove();
	$end.nextAll().remove();
	displayCommentaries();
}
function getUser(){
	$.getJSON('/user/getuser',loadUser);
}
function loadUser(user){
	$('#email').text(user.email);
	requests = user.requests;
	$("#membership").empty();
	for (var i=0;i<requests.length;i++){
		$("#membership").append('<p>Allow <span id="user'+i+'"></span> '
				+'(<span id="email'+i+'"></span>) to join <span id="group'+i+'"></span>?'
				+'<button> onclick="accept('+i+')" class="btn btn-default">Yes</button>'
				+'<button> onclick="reject('+i+')" class="btn btn-default">No</button></p>');
		$('#user'+i).text = requests[i].name;
		$('#email'+i).text = requests[i].email;
		$('#group'+i).text = requests[i].group;
	}
	if (user.groups){
		if (!user.current){
			user.current = user.name;
		}
		$('#user').html('<select class="form-control" style="width:auto;display:inline" id="contributeAs" onchange="contributeAs()"></select>');
		choose("contributeAs",[user.name].concat(user.groups),user.current);
	}else{
		$('#user').text(user.name);
	}
	commentaries = user.commentaries.sort(function(a,b){
		return b.date[b.date.length-1]-a.date[a.date.length-1];
	});
	displayCommentaries();
}
function displayCommentaries(){
	var text = "";
	for (var i=0;i<commentaries.length;i++){
		var c = commentaries[i];
		var j = c.html.length-1;
		var last = "last ";
		if (c.verse == verse && c.end_verse == endVerse){
			if (oldEdit != undefined){
				if (j != oldEdit){
					j = oldEdit;
					last = "";
				}
				oldEdit = undefined;
			}
			$(".ql-editor").html(c.html[j]);
		}
		text += "<a href=#"+version+'_'+c.book+'_'+c.verse+'_'+
			c.end_verse+"><p><b>"+bookName(c.book)+" "+
			c.chapter+":"+verseNumber(c.verse);
		if (c.chapter==c.end_chapter){
			if (c.verse!=c.end_verse){
				text += "-"+verseNumber(c.end_verse);
			}
		}else{
			text += "-"+c.end_chapter+":"+verseNumber(c.end_verse);
		}
		text += "</b> <i id='edited"+i+"'>"+last+"edited "+dateString(c.date[j])+" by "+
			c.editor[j]+".</i></p><div id='commentary"+i+"'>"+c.html[j]+"</div></a>";
		if (c.published){
			text += "<p><i>Published "+dateString(c.published)+".</i></p>";
		}
		if (c.date.length > 1){
			var k=c.date.length-1;
			var last = false;
			text += '<button class="btn btn-default" type="button" onclick="publish('+i+')">Publish</button>'+
				'<select class="form-control" style="width:auto;display:inline" id="loadEdit'+
				i+'" onchange="loadEdit('+i+')"><option value='+k+' disabled';
			if (j==k){
				text += " selected";
				last = true;
			}
			text += '>Load previous edit</option>';
			for (;k>=0;k--){
				text += '<option value='+k;
				if (j==k && !last){
					text += " selected";
				}
				text += '>'+dateString(c.date[k])+'</option>';
			}
			text += '</select>';
		}
		text += "<hr>";
	}
	$('#commentaries').html(text)
}
function publish(i){
	var j = $('#loadEdit'+i).val();
}
function loadEdit(i){
	var j = $('#loadEdit'+i).val();
	var c = commentaries[i];
	if (c.verse == verse && c.end_verse == endVerse){
		var last = "";
		if (j == c.html.length-1){
			last = "last ";
		}
		$(".ql-editor").html(c.html[j]);
		$("#edited"+i).html(last+"edited "+dateString(c.date[j])+" by "+c.editor[j]+".");
		$("#commentary"+i).html(c.html[j]);
	}else{
		oldEdit = j;
		location.hash = version+'_'+c.book+'_'+c.verse+'_'+c.end_verse;
	}
}
function contributeAs(){
	$.post('/user/contributeas',{"name":$('#contributeAs').val()},function(data){
		getUser();
	},'json');
}
function accept(i){
	var response = requests[i];
	response.accept = true;
	respond(response);
}
function reject(i){
	var response = requests[i];
	response.accept = false;
	respond(response);
}
function respond(response){
	$.post('/user/respond',response,function(data){
		getUser();
	},'json');
}
function changeUserName(e){
	if ($('#changeUserName input').val().length>0){
		$.post('/user/changeusername', $('#changeUserName').serialize(), function(data){
			var text = "";
			if (data.state == "changed"){
				getUser();
			}else if (data.state == "taken"){
				text = "The name "+data.name+" is already in use.";
			}else if (data.state == "invalid"){
				text = data.name+" is not a valid name.";
			}
			$('#formResponse').text(text);
		},'json');
	}
	e.preventDefault();
}
function createGroup(e){
	if ($('#createGroup input').val().length>0){
		$.post('/user/creategroup', $('#createGroup').serialize(), function(data){
			var text;
			if (data.state == "created"){
				text = "New group ("+data.group+") created!";
				getUser();
			}else if (data.state == "taken"){
				text = "The name "+data.group+" is already in use.";
			}else if (data.state == "invalid"){
				text = data.group+" is not a valid group name.";
			}
			$('#formResponse').text(text);
		},'json');
	}
	e.preventDefault();
}
function joinGroup(e){
	if ($('#joinGroup input').val().length>0){
		$.post('/user/joingroup', $('#joinGroup').serialize(), function(data){
			var text;
			if (data.state == "member"){
				text = "You are already a member of "+data.group;
				getUser();
			}else if (data.state == "locked"){
				text = data.group+" is not accepting new members.";
			}else if (data.state == "requested"){
				text = "A request to join has been sent to the members of "+data.group;
			}else if (data.state == "not a group"){
				text = data.group+" is not a group.";
			}
			$('#formResponse').text(text);
		},'json');
	}
	e.preventDefault();
}
function editCommentary(e){
	if ($(".ql-editor").text().length>0){
		$.post('/user/editcommentary',
				$("#editCommentary").serialize()+"&"+$.param({"html":$(".ql-editor").html()}),
				function(data){
			var text = "Save "+data.state+" on "+dateString(data.date);
			$('#saveResponse').text(text);
			getUser();
		},'json');
	}
	e.preventDefault();
}
function getUserCommentaries(){
	
}
$(document).ready(function(){
	$("#editCommentary").submit(editCommentary);
	$("#changeUserName").submit(changeUserName);
	$("#createGroup").submit(createGroup);
	$("#joinGroup").submit(joinGroup);
	var format = ['italic','link'];
	var quill = new Quill('#editor', {
	    theme: 'snow',
	    bounds: '#editor',
	    formats: format,
	    modules: {
	        toolbar: format
	    }
	});
	$(".multiple").hide();
	$('#multiple').click(function() {
		$(".multiple").toggle($('#multiple').is(':checked'));
		chooseEndChapter();
	});
	window.onhashchange = function(){
		if (autohash){
			autohash = false;
			getPassage();
		}else{
			var x = location.hash.replace('#','').split("_");
			version = x[0];
			book = x[1];
			chapter = x[3];
			verse = x[2]+"_"+x[3]+"_"+x[4];
			endChapter = x[6];
			endVerse = x[5]+"_"+x[6]+"_"+x[7];
			if (verse != endVerse){
				$("#multiple").prop("checked", true);
			}
			getVersions();
		}
	}
	getVersions();
	getUser();
});