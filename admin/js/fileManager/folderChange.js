/* global
 checkedFiles: true,
 checkedFolders: true,
 updateCheckedCount: false,
 renderFolderListTable: false,
 renderFileTree: false,
 bootbox: false,
 folderChange: true,
 querystring: false
*/


/**
 * Get Hash params
 * @return {object}
 */
var getHashParams = function(){
  return querystring.parse(window.location.hash.replace(/^#\?/,''));
}


/**
 * Update the current URI
 * @param {string} folder
 */
var updateUri = function(folder){
  var qs = getHashParams();
  //set the update
  qs.folder = folder.id
  //update the browser
  window.location.hash = '#?' + querystring.stringify(qs);
}


/**
 * Register folder change events
 * @param {object} elementList to register events to
 */
var registerFolderChangeEvents = function(elementList){
  elementList.off('click','.folderChange').on('click','.folderChange',
    function(){
      folderChange($(this).attr('data-folder-path'));
    }
  );
}

//folder change, move to another folder without reloading
var folderChangeInProgress = false
var folderChange = function(folderPath){
  //first we need to ask the server for all the data about the new folder
  //such as the folder list, file list, and file tree so we can build the
  //breadcrumb
  if(folderChangeInProgress) return
  folderChangeInProgress = true
  clearChecked()
  $.ajax('/file/list?json=true&path=' + folderPath,{
    success: function(res){
      if('ok' === res.status){
        //separate out our response to preserve the response
        var folderPath = res.folderPath
        var path = res.path
        var fileList = res.files
        //clear checked items on folder switch
        checkedFiles = [];
        checkedFolders = [];
        //update the current folder id
        $('#folderPath').attr('data-value',folderPath);
        //next we need to start building the new records using our stored
        //rendering functions
        renderFolderListTable(fileList);
        //that was easy now we need to render the fileTree
        renderFileTree(path);
        //update uri
        updateUri(folderPath);
        //register events
        registerFolderChangeEvents($('#fileTree'));
      } else {
        bootbox.alert('ERROR: ' + res.message);
      }
      folderChangeInProgress = false
    },
    error: function(){
      folderChangeInProgress = false
    }
  });
}


/**
 * Export folder change globally
 * @type {folderChange}
 */
window.folderChange = folderChange


/**
 * Folder change
 */
module.exports = function(){
  //register events to change folder
  registerFolderChangeEvents($('#folderList'));
  //setup the folder list with js
  folderChange(getHashParams().folder || $('#folderPath').attr('data-value'));
}
