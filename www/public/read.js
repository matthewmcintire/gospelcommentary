var versions;
var rev;
var commentaries;
var commentaries_loading;
var commentary_ready = false;
var version;
var books;
var book;
var book_number;
var chapters;
var chapter;
var content;
var verses;
var verse;
function unique(array) {
    return $.grep(array, function(el, index) {
        return index === $.inArray(el, array);
    });
}
function loadJSON(filename, success, fail) {
	var bucket = "https://storage.googleapis.com/gospel-in-every-passage.appspot.com/";
	return $.getJSON(bucket+encodeURI(filename),success).fail(fail);
}
function getVersions(){
	commentaries_loading = $.Deferred();
	loadJSON("versions.json",saveVersions);
	getCommentaries();
}
function getCommentaries(){
	loadJSON("commentaries.json",loadCommentaries);
}
function saveVersions(file){
	versions = file;
	if (localStorage.version){
		version = localStorage.version;
	}
	if ((version == undefined) || !(versions.hasOwnProperty(version))){
		if (versions.hasOwnProperty("eng-ESV")){
		  version = "eng-ESV";
		}else{
			version = Object.keys(versions)[0];
		}
	}
	if (localStorage.book){
		setBook(localStorage.book);
	}
	if (localStorage.chapter){
		chapter = localStorage.chapter;
	}
	getBooks();
	chooseVersion();
}
function loadCommentaries(file){
	loadJSON("commentary/"+file.rev+".json",saveCommentaries);
}
function saveCommentaries(file){
	commentaries = file;
	commentaries_loading.resolve();
	commentary_ready = true;
	
}
function chooseVersion(){
	var txt = '';
	for (var v in versions){
// 		var s = '';
// 		if (v == version){
// 			s = ' selected';
// 		}
		var n = versions[v]['abbreviation']+' '+versions[v]['name'];
		txt += '<li onclick="changeVersion('+"'"+v+"'"+')"><a>'+n+'</a></li>';
	}
	document.getElementById("chooseVersion").innerHTML = txt;

}
function changeVersion(v){
	version = v;
  getBooks();
	localStorage.version = version;
}
function getBooks(){
	loadJSON("scripture/" + versions[version]['dir'] + "/books.json",saveBooks);
}
function bookName(bookID){
	return books[bookID]["name"];
}
function saveBooks(file){
	books = file;
	if ((book == undefined) || !(books.hasOwnProperty(book))){
		setBook(books.ordered[0]);
	}
	chooseBook();
	getChapters();
}
function chooseBook(){
	var txt = '';
	for (var i=0;i<books.ordered.length;i++){
		var b = books.ordered[i];
		var n = books[b]["name"];
// 		var s = '';
// 		if (b == book){
// 			s = ' selected';
// 		}
		txt += '<li onclick="changeBook('+"'"+b+"'"+')"><a>'+n+'</a></li>';
	}
	document.getElementById("chooseBook").innerHTML = txt;
}
function changeBook(b){
	setBook(b);
	chapter = undefined;
	getChapters();
	localStorage.book = book;
}
function setBook(b){
	book = b;
//	book_number = books.ordered.indexOf(book)+1;
}
function getChapters(){
	chapters = books[book].chapters;
	if (chapters.indexOf(chapter) == -1){
		chapter = chapters[chapters.indexOf("1")];
	}
	chooseChapter();
}
function chooseChapter(){
	var txt = '';
	for (var i=0;i<chapters.length;i++){
		var c = chapters[i];
// 		var s = '';
// 		if (c == chapter){
// 			s = ' selected';
// 		}
		txt +='<li onclick="changeChapter('+"'"+c+"'"+')"><a>'+c+'</a></li>';
	}
	document.getElementById("chooseChapter").innerHTML = txt;
	changeChapter(chapter);
}
function changeChapter(c){
	chapter = c;
	var hash = version+'_'+book+'_'+chapter;
	if (location.hash == '#'+hash){
		getChapter();
	}else{
		location.hash = hash;
	}
}
function getChapter(){
	if (location.hash.length > 0) {
		var vbc = location.hash.replace('#','').split("_");
		version = vbc[0];
		setBook(vbc[1]);
		chapter = vbc[2];
		var path = "scripture/"+versions[version]['dir']+"/"+book+"/";
		var filename = version+"."+book+"."+chapter+".json";
		loadJSON(path+filename,saveChapter);
		if (commentary_ready){
			getCommentary();
		}else{
			commentaries_loading.done(getCommentary);
		}
		localStorage.version = version;
		localStorage.book = book;
		localStorage.chapter = chapter;
	}
}
function getCommentary(){
	var rev = commentaries[book][chapter];
	if (rev == undefined){
		noCommentary();
	}else{
		var path = "commentary/"+book+"/";
		var filename = book+"."+chapter+"."+rev+".json";
		loadJSON(path+filename,displayCommentary,noCommentary);
	}
}
function saveChapter(file){
	content  = file;
	displayChapter();
}
function verseNumber(v){
	return v.split('_').slice(-1)[0];
}
function displayChapter(file){
	var text = content.text;
	if (content.copyright != null){
		text += "<hr>" + content.copyright;
	}
	var brand = books[book]["name"]+" "+chapter+" ("+versions[version]['abbreviation']+")";
	document.getElementById("scripture").innerHTML = text;
	document.getElementById("current-page").innerHTML = brand;
}	
function displayCommentary(file){
	var content  = file;
	var text = content[0].text;
	document.getElementById("commentary").innerHTML = text;
}
function noCommentary(){
	loadJSON("commentaries.json",function(file){
		if (file.rev != rev){
			commentaries_loading = $.Deferred();
			commentary_ready = false;
			loadCommentaries(file);
			commentaries_loading.done(getCommentary);
		}else{
			$("#commentary").html("No commentary found for this chapter.");
		}
	});
}
$( window ).resize(function() {
	if ($(window).width()>768){
		$(".dropdown-menu").css("max-height", $(window).height() - $(".navbar-header").height() + "px");
	}else{
		$(".dropdown-menu").css("max-height","none");
	}
	$("#myNavbar").css("max-height", $(window).height() - $(".navbar-header").height() -1 + "px");
});
$(document).ready(function(){
	getVersions();
	$( window ).resize();
});