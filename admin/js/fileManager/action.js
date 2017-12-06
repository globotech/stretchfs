/* global
 checked: true
 bootbox: false
*/


/**
 * Checked files
 * @type {object}
 */
var checked = window.fileChecked = {
  files: [],
  folders: [],
  count: 0
}

var updateCheckedCount = function(){
  checked.count = checked.folders.length + checked.files.length;
  $('#checkedCount').text(checked.count);
  var submitButton = $('#actionSubmitButton');
  if(0 === checked.count){
    submitButton.attr('disabled','disabled');
  }
  else{
    submitButton.removeAttr('disabled');
  }
}

var applyCheckboxListeners = function(){
  var folderListTable = $('#folderList');
  var folderCheckboxChange = function(){
    var id = $(this).attr('value');
    var index = checked.folders.indexOf(id)
    if($(this).is(':checked') && -1 === index){
      checked.folders.push(id);
    } else if(!$(this).is(':checked') && -1 !== index) {
      checked.folders.splice(index,1);
    }
    updateCheckedCount();
  }
  var fileCheckboxChange = function(){
    var id = $(this).attr('value');
    var index = checked.files.indexOf(id)
    if($(this).is(':checked') && -1 === index){
      checked.files.push(id);
    } else if(!$(this).is(':checked') && -1 !== index) {
      checked.files.splice(index,1);
    }
    updateCheckedCount();
  }
  //remove any existing listeners
  folderListTable.off('change','input.folderCheckbox',folderCheckboxChange);
  folderListTable.off('change','input.fileCheckbox',fileCheckboxChange);
  //add new listeners
  folderListTable.on('change','input.folderCheckbox',folderCheckboxChange);
  folderListTable.on('change','input.fileCheckbox',fileCheckboxChange);
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
          if(checked.files.indexOf(id) < 0){
            checked.files.push(id);
          }
        }
        if(el.hasClass('folderCheckbox')){
          if(checked.folders.indexOf(id) < 0){
            checked.folders.push(id);
          }
        }
      })
    }
    else{
      checkboxes.each(function(){
        var el = $(this)
        var id = el.val()
        var index = checked.files.indexOf(id)
        if(el.hasClass('fileCheckbox')){
          checked.files.splice(index,1);
        } else if(el.hasClass('folderCheckbox')){
          checked.folders.splice(index,1);
        }
      })
    }
    updateCheckedCount();
  })
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
            $.ajax('/file/remove?json=true',{
              contentType: 'application/json',
              type: 'POST',
              data: JSON.stringify({
                remove: checked.folders.concat(checked.files)
              }),
              success: function(res){
                if('ok' === res.status){
                  folderChange($('#folderPath').attr('data-value'))
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


/**
 * Apply checkbox listeners
 */
window.applyCheckboxListeners = function(){
  updateCheckedCount()
  applyCheckboxListeners()
}


/**
 * Clear checked
 */
window.clearChecked = function(){
  $('#folderList').children('input[type=checkbox]').prop('checked',false)
  checked.files = []
  checked.folders = []
  updateCheckedCount()
}
