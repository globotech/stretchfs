'use strict';
/* global
  bootbox: false,
  importStatusShow: false
 */


/**
 * File Import
 */
module.exports = function(){

  var fileImportSubmitButton = $('#fileImportSubmitButton');
  var fileImportSubmitButtonLadda = Ladda.create(
    document.getElementById('fileImportSubmitButton')
  );
  //file import
  var fileImport = function(){
    fileImportSubmitButtonLadda.start();
    var folderPath = $('#folderPath').attr('data-value');
    // pretty sure the problem is here
    $.ajax('/file/import',{
      contentType: 'application/json',
      type: 'POST',
      data: JSON.stringify({
        folderPath: folderPath,
        urlText: $('#fileImportUrls').val()
      }),
      success: function(res){
        fileImportSubmitButtonLadda.stop();
        if('ok' === res.status){
          $('#fileImportModal').modal('hide');
          importStatusShow();
          setTimeout(function(){
            importStatusReload();
          },250);
          folderChange(folderPath);
        } else {
          bootbox.alert('ERROR: ' + res.message);
        }
      }
    });
  }

  //import file
  var fileImportSetup = function(){
    $('#fileImportModal').modal('show');
    $('#fileImportUrls').focus();
    fileImportSubmitButton.on('click',function(){
      fileImport()
    })
  }
  $('#fileImportButton').click(function(){
    fileImportSetup();
    return false;
  })
  $(document).bind('keyup keydown',function(e){
    if(e.ctrlKey && 73 === e.which && !e.shiftKey){
      fileImportSetup();
      return false;
    }
  })
  $('#fileImportModal').keypress(function(e){
    if(13 === e.which){
      fileImport();
    }
  })
}
