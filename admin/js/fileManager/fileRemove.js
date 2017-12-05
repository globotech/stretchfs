'use strict';
/* global
 renderFile: false,
 bootbox: false
 */


/**
 * File Remove
 */
module.exports = function(){
  var jFolderList = $('#folderList');
  //file remove
  var fileRemove = function(fileId){
    bootbox.confirm(
      'Are you sure you want to delete this file ' +
      '<span style="color: red;">This CANNOT BE UNDONE!</span>',
      function(result){
        var checkedFolders = []
        var checkedFiles = [fileId]
        if(true === result){
          $.ajax('/folder/remove',{
            contentType: 'application/json',
            type: 'POST',
            data: JSON.stringify({
              checkedFiles: checkedFiles
            }),
            success: function(res){
              if('ok' === res.status){
                var checkboxes = $('table.table td input');
                checkboxes.each(function(){
                  var el = $(this);
                  var val = el.val();
                  var tableRow = el.closest('tr');
                  //verify we want to remove the row
                  if(
                    (
                      el.hasClass('fileCheckbox') &&
                      checkedFiles.indexOf(val) >= 0
                    ) ||
                    (
                      el.hasClass('folderCheckbox') &&
                      checkedFolders.indexOf(val) >= 0
                    )
                  )
                  {
                    //need to remove the selections
                    if(el.hasClass('fileCheckbox'))
                      checkedFiles.splice(checkedFiles.indexOf(val),1)
                    if(el.hasClass('folderCheckbox'))
                      checkedFolders.splice(checkedFolders.indexOf(val),1)
                    tableRow.find('td').fadeOut(1000,function(){
                      tableRow.remove();
                      updateCheckedCount();
                    })
                  }
                })
              }
              else{
                bootbox.alert('ERROR: ' + res.message);
              }
            }
          })
        }
      }
    );
  }
  //edit files
  jFolderList.on('click','.fileRemove',function(){
    var fileId = $(this).attr('data-file-id');
    fileRemove(fileId);
  })
}
