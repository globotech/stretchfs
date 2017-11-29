/* global document:false, Dropzone:false */
$(document).ready(function(){
  Dropzone.options.fileUpload = {
    paramName: 'file',
    maxFilesize: 4096 //mb
  }
})
