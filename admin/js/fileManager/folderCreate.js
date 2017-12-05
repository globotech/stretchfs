'use strict';
/* global
 folderListTbody: false,
 renderFolder: false,
 bootbox: false
*/


/**
 * Folder create
 */
module.exports = function(){
  var jFolderCreateName = $('#folderCreateName');
  var jFolderCreateModal = $('#folderCreateModal');
  var jFolderCreateSubmit = $('#folderCreateSubmit');
  //folder creation without reloading
  var folderCreate = function(){
    var folderName = jFolderCreateName.val();
    var FolderId = +$('#parentFolderId').attr('data-value');
    if('' === folderName) return false;
    $.ajax('/folder/create',{
      contentType: 'application/json',
      type: 'POST',
      data: JSON.stringify({
        name: folderName,
        FolderId: FolderId
      }),
      success: function(res){
        //close down the existing modal
        jFolderCreateModal.modal('hide');
        if('ok' === res.status){
          //when successful clear the value on the name, errors will want to try
          //again so we can save the name for later
          jFolderCreateName.val('');
          var folder = res.folder
          //render the new folder row
          var folderRow = renderFolder(folder);
          folderRow.hide().fadeIn(1000);
          folderListTbody.append(folderRow);
        } else {
          bootbox.alert('ERROR: ' + res.message);
        }
      }
    });
  }
  jFolderCreateSubmit.click(folderCreate);
  //create folder
  $(document).bind('keyup keydown',function(e){
    if(e.ctrlKey && 69 === e.which){
      jFolderCreateModal.modal('show');
      jFolderCreateName.focus();
      return false;
    }
  })
  jFolderCreateModal.keypress(function(e){
    if(13 === e.which){
      folderCreate();
    }
  })
}
