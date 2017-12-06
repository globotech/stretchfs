'use strict';
/* global
 folderListTbody: true,
 renderFolder: true,
 renderFolders: true,
 renderFile: true,
 renderFiles: true,
 renderFolderListTable: true,
 renderFileTree: true
*/


/**
 * Encode path for storage
 * @param {string} path
 * @return {string}
 */
var encode = window.encodeFilePath = function(path){
  if('string' === typeof path && path.match(/,/)) return path
  if(!path instanceof Array) path = [path]
  path = path.filter(function(el){return (el)})
  return ',' + path.join(',') + ','
}


/**
 * Decode path from storage
 * @param {string} path
 * @return {string}
 */
var decode = window.decodeFilePath = function(path){
  if(path instanceof Array) return path.slice(0)
  if(!path) path = ''
  return path.split(',').filter(function(el){return (el)})
}


/**
 * Render Folder
 * @param {object} folder
 * @return {object}
 */
var renderFolder = function(folder){
  return $(
    '<tr id="folderList' + folder.path + '">' +
    '<td>' +
    '<input class="folderCheckbox" type="checkbox"  value="' +
      folder.path + '">' +
    '</td>' +
    '<td><span class="glyphicon glyphicon-folder-close"></span></td>' +
    '<td><a href="#' + folder.path + '"class="folderChange"' +
      ' data-folder-path="' + folder.path + '">' + folder.name + '</></td>' +
    '<td>Folder</td>' +
    '<td>' + new Date(folder.createdAt).toDateString() + '</td>' +
    '<td>' +
    '<a class="folderEdit" data-folder-path="' + folder.path +
      '"><span class="glyphicon glyphicon-pencil" /></a></>' +
    '<span>&nbsp;</span>' +
    '<a class="folderDelete" data-folder-path="' + folder.path +
      '"><span class="glyphicon glyphicon-remove" /></a></a>' +
    '</td>' +
    '</tr>'
  );
}

var renderFolders = function(folders){
  var folderListTbody = $('#folderListTbody');
  for(var i = 0; i < folders.length; i++){
    if(true === folders[i].folder){
      folderListTbody.append(renderFolder(folders[i]))
    }
  }
}


/**
 * Render File
 * @param {object} file
 * @return {object}
 */
var renderFile = function(file){
  return $(
    '<tr id="folderListFile' + file.path + '">' +
    '<td>' +
    '<input class="fileCheckbox" type="checkbox"  value="'+ file.path+ '">' +
    '</td>' +
    '<td><span class="glyphicon glyphicon-file"></span></td>' +
    '<td><a href="#' + file.path + '" class="fileDetail" ' +
      'data-file-handle="' + file.handle + '">' + file.name + '</></td>' +
    '<td>' + file.mimeType + '</td>' +
    '<td>' + new Date(file.createdAt).toDateString() + '</td>' +
    '<td>' +
    '<a class="fileEdit" data-file-handle="' + file.handle +
      '"><span class="glyphicon glyphicon-pencil" /></a></>' +
    '<span>&nbsp;</span>' +
    '<a class="fileRemove" data-file-handle="' + file.handle +
      '"><span class="glyphicon glyphicon-remove" /></a></>' +
    '</td>' +
    '</tr>'
  );
}

var renderFiles = function(files){
  var folderListTbody = $('#folderListTbody');
  for(var i = 0; i < files.length; i++){
    if(!files[i].folder){
      folderListTbody.append(renderFile(files[i]));
    }
  }
}


/**
 * Render folder list
 * @param {array} fileList
 */
window.renderFolderListTable = function(fileList){
  var folderListTbody = $('#folderListTbody');
  //clear the table
  folderListTbody.fadeOut(500).empty();
  setTimeout(function(){
    folderListTbody.fadeIn(300);
    //start creating the new table
    renderFolders(fileList)
    renderFiles(fileList)
    applyCheckboxListeners()
  },500);
}


/**
 * Render file tree
 * @param {array} tree
 */
window.renderFileTree = function(tree){
  //first we want to empty the existing file tree
  var treeWrapper = $('#fileTree');
  treeWrapper.empty();
  var currentPath = []
  var encPath = ''
  //next we need to setup the div to contain the new fileTree
  //now loop through the tree
  var lastLeaf = !tree.length
  var leaf = $(
    '<a href="#,," class="folderChange" data-folder-path=",,">' +
    '<span class="glyphicon glyphicon-folder-' +
    (lastLeaf ? 'open' : 'close') + '" />' +
    '<span>&nbsp;&nbsp;</span>' +
    '<span>Home</span>' +
    (!lastLeaf ? '<span> ->&nbsp;&nbsp;</span>' : '') +
    '</a>'
  );
  leaf.hide().fadeIn(1000);
  treeWrapper.append(leaf);
  tree.forEach(function(branch,i){
    lastLeaf = (i === (tree.length - 1))
    currentPath.push(branch)
    encPath = encode(currentPath)
    if(!lastLeaf){
      leaf = $(
        '<a href="#' + encPath + '" class="folderChange" ' +
          'data-folder-path="' + encPath + '">' +
        '<span class="glyphicon glyphicon-folder-' +
          (lastLeaf ? 'open' : 'close') + '" />' +
        '<span>&nbsp;&nbsp;</span>' +
        '<span>' + branch + '</span>' +
        (!lastLeaf ? '<span> ->&nbsp;&nbsp;</span>' : '') +
        '</a>'
      );
    } else {
      leaf = $(
        '<span class="glyphicon glyphicon-folder-open" />' +
        '<span> ' + branch + '</span>'
      );
    }
    leaf.hide().fadeIn(1000);
    treeWrapper.append(leaf);
  })
}
