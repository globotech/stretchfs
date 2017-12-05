'use strict';


/**
 * Modules
 * @type {fileManager}
 */
exports = {
  action: require('./action'),
  render: require('./render'),
  fileDetail: require('./fileDetail'),
  fileEdit: require('./fileEdit'),
  fileExport: require('./fileExport'),
  fileImport: require('./fileImport'),
  fileRemove: require('./fileRemove'),
  folderChange: require('./folderChange'),
  folderCreate: require('./folderCreate'),
  folderEdit: require('./folderEdit'),
  importStatus: require('./importStatus'),
  move: require('./move')
}


/**
 * Init file manager
 */
window.fileManager = function(){
  exports.action()
  exports.fileDetail()
  exports.fileEdit()
  exports.fileImport()
  exports.fileRemove()
  exports.folderChange()
  exports.folderCreate()
  exports.folderEdit()
  exports.importStatus()
  exports.move()
  $(document).ready(function(){
    var ourDropzone = new Dropzone('#fileUpload',{
      url: function(){
        var ioUrl = $('#ioUrl').attr('data-value')
        var folderPath = $('#parentFolderPath').attr('data-value');
        return ioUrl + '/file/upload?folder=' + folderPath;
      },
      timeout: 99999999,
      maxFilesize: 4096,
      withCredentials: true
    })
    ourDropzone.on('success',function(file){
      $.ajax('/folder/listInfo',{
        contentType: 'application/json',
        type: 'POST',
        data: JSON.stringify({
          folderId: $('#parentFolderId').attr('data-value')
        }),
        success: function(res){
          renderFolderListTable(res.folderList,res.fileList);
          if(file.type.match(/video/i)){
            importStatusShow();
            importStatusReload();
          }
        }
      });
    });
    ourDropzone.on('sending',function(file,xhr){
      //increase xhr timeout
      xhr.timeout = 99999999;
    })
  })
}
