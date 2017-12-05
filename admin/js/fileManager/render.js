/* global
 folderListTbody: true,
 renderFolder: true,
 renderFolders: true,
 renderFile: true,
 renderFiles: true,
 renderFolderListTable: true,
 renderFileTree: true
*/

var folderListTbody = $('#folderListTbody');

var renderFolder = function(folder){
  return $(
    '<tr id="folderList' + folder.id + '">' +
    '<td>' +
    '<input class="folderCheckbox" type="checkbox"  value="'+ folder.id + '">' +
    '</td>' +
    '<td><span class="glyphicon glyphicon-folder-close"></span></td>' +
    '<td><a class="folderChange" data-folder-id="' + folder.id + '">' + folder.name + '</></td>' +
    '<td>Folder</td>' +
    '<td>' + new Date(folder.createdAt).toDateString() + '</td>' +
    '<td>' +
    '<a class="folderEdit" data-folder-id="' + folder.id + '"><span class="glyphicon glyphicon-pencil" /></a></>' +
    '<span>&nbsp;</span>' +
    '<a class="folderDelete" data-folder-id="' + folder.id + '"><span class="glyphicon glyphicon-remove" /></a></a>' +
    '</td>' +
    '</tr>'
  );
}

var renderFolders = function(folders){
  for(var i = 0; i < folders.length; i++){
    folderListTbody.append(renderFolder(folders[i]))
  }
}

var renderFile = function(file){
  return $(
    '<tr id="folderListFile' + file.id + '">' +
    '<td>' +
    '<input class="fileCheckbox" type="checkbox"  value="'+ file.id+ '">' +
    '</td>' +
    '<td><span class="glyphicon glyphicon-file"></span></td>' +
    '<td><a class="fileDetail" data-file-id="' + file.id + '">' + file.name + '</></td>' +
    '<td>' + file.type + '</td>' +
    '<td>' + new Date(file.createdAt).toDateString() + '</td>' +
    '<td>' +
    '<a class="fileEdit" data-file-id="' + file.id + '"><span class="glyphicon glyphicon-pencil" /></a></>' +
    '<span>&nbsp;</span>' +
    '<a class="fileRemove" data-file-id="' + file.id + '"><span class="glyphicon glyphicon-remove" /></a></>' +
    '</td>' +
    '</tr>'
  );
}

var renderFiles = function(files){
  for(var i = 0; i < files.length; i++){
    folderListTbody.append(renderFile(files[i]));
  }
}


var renderFolderListTable = function(Folders,Files){
  //clear the table
  folderListTbody.fadeOut(500).empty();
  setTimeout(function(){
    folderListTbody.fadeIn(300);
    //start creating the new table
    renderFolders(Folders)
    renderFiles(Files)
  },500);
}

var renderFileTree = function(tree){
  //first we want to empty the existing file tree
  var treeWrapper = $('#fileTree');
  treeWrapper.empty();
  //next we need to setup the div to contain the new fileTree
  //now loop through the tree
  tree.forEach(function(branch,i){
    var lastLeaf = (i === (tree.length - 1))
    var leaf = null
    if('folder' === branch.type){
      leaf = $(
        '<a class="folderChange" data-folder-id="' + branch.id + '">' +
        '<span class="glyphicon glyphicon-folder-' + (lastLeaf ? 'open' : 'close') + '" />' +
        '<span>&nbsp;&nbsp;</span>' +
        '<span>' + ('root' === branch.name ? 'Home' : branch.name) + '</span>' +
        (!lastLeaf ? '<span> ->&nbsp;&nbsp;</span>' : '') +
        '</a>'
      );
    } else {
      leaf = $(
        '<a class="fileDetail" data-file-id="' + branch.id + '">' +
        '<span class="glyphicon glyphicon-file" />' +
        '<span>' + branch.name + '</span>' +
        '</a>'
      );
    }
    leaf.hide().fadeIn(1000);
    treeWrapper.append(leaf);
  })
}
