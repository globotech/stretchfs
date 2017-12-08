'use strict';
/* global checkedFiles: false, bootbox: false */


/**
 * File export
 */
module.exports = function(){
  var fileExportTableBody = $('#fileExportTableBody');
  var fileExportModal = $('#fileExportModal');
  var renderFileExport = function(res){
    //do some stuff with the response this is where ramey shines
    var tableRows = [];
    var fileList = res.fileList;
    if(fileList.length){
      fileList.forEach(function(file){
        var mainRow = $('<tr>');
        var fileColumn = $('<td>' + file.name + '</td>');
        var typeColumn = $('<td>' + file.mimeType + '</td>')
        var urlColumn = null;
        if('video' === file.type){
          urlColumn = $('<td>' + res.baseUrl + '/file/embed/' +
            file.handle + '</td>')
        } else {
          urlColumn = $('<td>' + res.baseUrl + '/file/detail?handle=' +
            file.handle + '</td>')
        }
        mainRow.append(fileColumn)
        mainRow.append(typeColumn)
        mainRow.append(urlColumn)
        tableRows.push(mainRow)
      })
    } else {
      var mainRow = $('<tr><td colspan="3">No files selected</td></tr>');
      tableRows.push(mainRow)
    }
    fileExportTableBody.empty();
    tableRows.forEach(function(row){fileExportTableBody.append(row);})
  }
  var fileExport = function(fileList){
    //first we need to ask the server for all the data about the new folder
    //such as the folder list, file list, and file tree so we can build the
    //breadcrumb
    $.ajax('/file/export',{
      contentType: 'application/json',
      type: 'POST',
      data: JSON.stringify({
        fileList: fileList
      }),
      success: function(res){
        if('ok' === res.status){
          renderFileExport(res)
          fileExportModal.modal('show')
          fileExportModal.on('hidden.bs.modal',function(){
            //$('#fileExportFrame').removeAttr('src')
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
    if('export' === val){
      fileExport(window.fileChecked.files);
    }
  })
}
