'use strict';
/* global
  folderChange: false,
  checkedFiles: false,
  checkedFolders: false,
  bootbox: false
*/


/**
 * File move
 */
module.exports = function(){
  var moveFolderSelect = $('#moveFolderSelect');
  var moveModal = $('#moveModal');
  var renderFileMove = function(res){
    var folderRows = [
      $('<option value=",">Home</option>')
    ];
    var folderList = res.folderList;
    if(folderList.length){
      folderList.forEach(function(folder){
        var row = $(
          '<option value="' + folder.path + '">' + folder.name +'</option>');
        folderRows.push(row)
      })
    } else {
      var row = $('<option value="0">No folders available</option>');
      folderRows.push(row)
    }
    moveFolderSelect.empty();
    folderRows.forEach(function(row){moveFolderSelect.append(row);})
  }
  var fileMoveAction = function(folderList,fileList,destinationFolderPath){
    $.ajax('/file/moveTo',{
      contentType: 'application/json',
      type: 'POST',
      data: JSON.stringify({
        folderList: folderList,
        fileList: fileList,
        destinationPath: destinationFolderPath
      }),
      success: function(res){
        if('ok' === res.status){
          folderChange(destinationFolderPath)
          moveModal.modal('hide')
          moveModal.on('hidden.bs.modal',function(){
            moveFolderSelect.empty()
          })
        } else {
          bootbox.alert('ERROR: ' + res.message);
        }
      }
    });
  }
  var fileMove = function(folderList,fileList){
    //ask the server for a list of folders we can use submitting the folderId
    //list as a filter
    $.ajax('/file/moveList',{
      contentType: 'application/json',
      type: 'POST',
      data: JSON.stringify({
        skip: folderList.concat(fileList)
      }),
      success: function(res){
        if('ok' === res.status){
          renderFileMove(res)
          moveModal.modal('show')
          moveModal.on('hidden.bs.modal',function(){
            //$('#fileExportFrame').removeAttr('src')
          })
          //register event to handle move submission
          $('#moveSubmit').one('click',function(){
            fileMoveAction(folderList,fileList,$('#moveFolderSelect').val())
          })
        } else {
          bootbox.alert('ERROR: ' + res.message);
        }
      }
    });
  }
  //register events to show export modal
  $('#actionSubmitButton').on('click',function(){
    var val = $('#actionType').val();
    if('move' === val){
      fileMove(window.fileChecked.folders,window.fileChecked.files);
    }
  })
}
