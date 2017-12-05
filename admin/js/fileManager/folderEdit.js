'use strict';
/* global
 renderFolder: false,
 bootbox: false
*/


/**
 * Folder edit
 */
module.exports = function(){
  var jFolderList = $('#folderList');
  //folder edit
  var folderEdit = function(folderId){
    //first we need to ask the server for all the data about the folder
    $.ajax('/folder/listInfo',{
      contentType: 'application/json',
      type: 'POST',
      data: JSON.stringify({
        folderId: folderId
      }),
      success: function(res){
        if('ok' === res.status){
          //separate out our response to preserve the response
          var folder = res.folder
          //update fields
          var folderEditName = $('#folderEditName');
          $('#folderEditId').val(folder.id)
          folderEditName.val(folder.name)
          $('#folderEditModal').modal('show')
          //register our success event so we can update
          var editFolderSubmit = function(){
            $.ajax('/folder/update',{
              contentType: 'application/json',
              type: 'POST',
              data: JSON.stringify({
                folderId: folder.id,
                name: $('#folderEditName').val()
              }),
              success: function(res){
                if('ok' === res.status){
                  //now we need to render the folder
                  $('#folderList' + res.folder.id).replaceWith(
                    renderFolder(res.folder)
                  );
                  $('#folderEditModal').modal('hide');
                } else {
                  bootbox.alert('ERROR: ' + res.message);
                }
              }
            })
          }
          var editFolderSubmitSelect = $('#folderEditSubmit');
          editFolderSubmitSelect.off('click',editFolderSubmit)
          editFolderSubmitSelect.one('click',editFolderSubmit)
          folderEditName.keypress(function(e){
            if(13 === e.which){
              editFolderSubmit();
            }
          })
        } else {
          bootbox.alert('ERROR: ' + res.message);
        }
      }
    });
  }
  //edit folders
  jFolderList.on('click','.folderEdit',function(){
    var folderId = $(this).attr('data-folder-id');
    folderEdit(folderId);
  })
}
