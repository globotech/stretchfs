'use strict';
/* global
 renderFile: false,
 bootbox: false
 */


/**
 * File Edit
 */
module.exports = function(){
  var jFolderList = $('#folderList');
  //file edit
  var fileEdit = function(fileId){
    //first we need to ask the server for all the data about the file
    $.ajax('/file/editDetail',{
      contentType: 'application/json',
      type: 'POST',
      data: JSON.stringify({
        fileId: fileId
      }),
      success: function(res){
        if('ok' === res.status){
          //separate out our response to preserve the response
          var file = res.file
          //update fields
          var jFileEditModal = $('#fileEditModal');
          var jFileEditName = $('#fileEditName');
          var jFileEditDescription = $('#fileEditDescription');
          var jFileEditPublic = $('#fileEditPublic');
          var jFileEditPassword = $('#fileEditPassword');
          var jFileEditSubmit = $('#fileEditSubmit');
          var jFileEditId = $('#fileEditId');
          jFileEditId.val(file.id);
          jFileEditName.val(file.name);
          jFileEditDescription.val(file.description);
          jFileEditPublic.prop('checked',!!file.public);
          jFileEditPassword.val(file.password);
          jFileEditModal.modal('show');
          //register our success event so we can update
          var editFileSubmit = function(){
            $.ajax('/file/update',{
              contentType: 'application/json',
              type: 'POST',
              data: JSON.stringify({
                fileId: file.id,
                name: jFileEditName.val(),
                description: jFileEditDescription.val(),
                public: !!jFileEditPublic.prop('checked'),
                password: jFileEditPassword.val()
              }),
              success: function(res){
                if('ok' === res.status){
                  //now we need to render the file record
                  $('#folderListFile' + res.file.id).replaceWith(
                    renderFile(res.file)
                  );
                  jFileEditModal.modal('hide');
                } else {
                  bootbox.alert('ERROR: ' + res.message);
                }
              }
            })
          }
          jFileEditSubmit.off('click',editFileSubmit)
          jFileEditSubmit.one('click',editFileSubmit)
          jFileEditModal.keypress(function(e){
            if(13 === e.which){
              editFileSubmit();
            }
          })
        } else {
          bootbox.alert('ERROR: ' + res.message);
        }
      }
    });
  }
  //edit files
  jFolderList.on('click','.fileEdit',function(){
    var fileId = $(this).attr('data-file-id');
    fileEdit(fileId);
  })
}
