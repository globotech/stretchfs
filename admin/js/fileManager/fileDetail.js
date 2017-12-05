'use strict';


/**
 * File Detail
 */
module.exports = function(){
  var jFolderList = $('#folderList');
  //file detail
  var fileDetailModal = $('#fileDetailModal');
  var fileDetailFrame = $('#fileDetailFrame');
  var fileDetail = function(fileId){
    fileDetailFrame.attr('src','/file/detail-short?id=' + fileId)
    fileDetailModal.modal('show')
    fileDetailModal.on('hidden.bs.modal',function(){
      $('#fileDetailFrame').removeAttr('src')
    })
  }
  //register events to show file details
  jFolderList.on('click','.fileDetail',function(){
    var fileId = $(this).attr('data-file-id');
    fileDetail(fileId);
  })
}
