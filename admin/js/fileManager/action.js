/* global
 checkedFiles: true,
 checkedFolders: true,
 checkedCount: true,
 bootbox: false
*/
var checkedFiles = [];
var checkedFolders = [];
var checkedCount = 0;

var folderListTable = $('#folderList');

var updateCheckedCount = function(){
  checkedCount = checkedFiles.length + checkedFolders.length;
  $('#checkedCount').text(checkedCount);
  var submitButton = $('#actionSubmitButton');
  if(0 === checkedCount){
    submitButton.attr('disabled','disabled');
  }
  else{
    submitButton.removeAttr('disabled');
  }
}


/**
 * List actions
 */
module.exports = function(){
  $('#toggle').click(function(){
    var checked = $(this).is(':checked');
    var checkboxes = $('table.table td input');
    if(checked){
      checkboxes.each(function(){
        var el = $(this)
        var id = el.val()
        if(el.hasClass('fileCheckbox')){
          if(checkedFiles.indexOf(id) < 0){
            checkedFiles.push(id);
          }
        }
        if(el.hasClass('folderCheckbox')){
          if(checkedFolders.indexOf(id) < 0){
            checkedFolders.push(id);
          }
        }
      })
    }
    else{
      checkboxes.each(function(){
        var el = $(this)
        var id = el.val()
        if(el.hasClass('fileCheckbox')){
          checkedFiles.splice(checkedFiles.indexOf(id),1);
        }
        if(el.hasClass('folderCheckbox')){
          checkedFolders.splice(checkedFolders.indexOf(id),1);
        }
      })
    }
    updateCheckedCount();
  })
  var fileCheckboxChange = function(){
    var id = $(this).attr('value');
    if($(this).is(':checked')){
      if(checkedFiles.indexOf(id) < 0){
        checkedFiles.push(id);
      }
    }
    else{
      checkedFiles.splice(checkedFiles.indexOf(id),1);
    }
    updateCheckedCount();
  }
  var folderCheckboxChange = function(){
    var id = $(this).attr('value');
    if($(this).is(':checked')){
      if(checkedFolders.indexOf(id) < 0){
        checkedFolders.push(id);
      }
    }
    else{
      checkedFolders.splice(checkedFolders.indexOf(id),1);
    }
    updateCheckedCount();
  }
  var applyCheckboxListeners = function(){
    //remove any existing listeners
    folderListTable.off('change','input.fileCheckbox',fileCheckboxChange);
    folderListTable.off('change','input.folderCheckbox',folderCheckboxChange);
    //add new listeners
    folderListTable.on('change','input.fileCheckbox',fileCheckboxChange);
    folderListTable.on('change','input.folderCheckbox',folderCheckboxChange);
  }
  //focus the folder create input box when the modal loads
  $('#folderCreateModal').on('shown.bs.modal',function(){
    $('#folderCreateName').focus();
  });
  //update action type submit color
  var updateActionTypeSubmitColor = function(action){
    var el = null;
    if('move' === action){
      el = $('#actionSubmitButton');
      el.removeClass('btn-danger');
      el.addClass('btn-info');
    }
    if('remove' === action){
      el = $('#actionSubmitButton');
      el.removeClass('btn-info');
      el.addClass('btn-danger');
    }
    if('export' === action){
      el = $('#actionSubmitButton');
      el.removeClass('btn-info');
      el.removeClass('btn-danger');
      el.addClass('btn-primary');
    }
  }
  var actionTypeEl = $('#actionType');
  //change the button color on action change
  actionTypeEl.change(function(){
    updateActionTypeSubmitColor($(this).val());
  })
  $('#actionSubmitButton').click(function(){
    var val = $('#actionType').val();
    //if('move' === val){
      //$('#moveModal').modal('show');
      //see move.js
    //}
    //if('export' === val){
      //see fileExport.js
    //}
    if('remove' === val){
      bootbox.confirm(
        'Are you sure you want to delete these files' +
        ' and folders? <span style="color: red;">This CANNOT BE UNDONE!</span>',
        function(result){
          if(true === result){
            $.ajax('/folder/remove',{
              contentType: 'application/json',
              type: 'POST',
              data: JSON.stringify({
                checkedFolders: checkedFolders,
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
  })
  //do it on page load to get the button right to start
  updateActionTypeSubmitColor(actionTypeEl.val());
  //update checkbox count and fix button
  updateCheckedCount();
  //setup checkbox listeners
  applyCheckboxListeners();
}


/**
 * Update checked items
 */
window.updateCheckedCount = function(){
  updateCheckedCount()
}
