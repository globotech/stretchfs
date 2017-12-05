'use strict';


/**
 * File Detail
 */
module.exports = function(){
  var jFolderList = $('#folderList');
  //file detail
  var fileDetailModal = $('#fileDetailModal');
  var fileDetailFrame = $('#fileDetailFrame');
  var fileDetail = function(handle){
    fileDetailFrame.attr('src','/file/detail?short=true&handle=' + handle)
    fileDetailModal.modal('show')
    fileDetailModal.on('hidden.bs.modal',function(){
      $('#fileDetailFrame').removeAttr('src')
    })
  }
  //register events to show file details
  jFolderList.on('click','.fileDetail',function(){
    var fileHandle = $(this).attr('data-file-handle');
    fileDetail(fileHandle);
  })
}
