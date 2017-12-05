'use strict';
/* global
  importStatusShow: true,
  importStatusHide: true,
  importStatusReload: true,
  importStatusReloading: true
*/


/**
 * Import status
 */
module.exports = function(){

  var importStatusFullBox = $('#importStatusFull');
  var importStatusSmallBox = $('#importStatusSmall');
  var importStatusButton = $('#importStatusButton');
  var importStatusHideButton = $('#importStatusHideButton');
  var importStatusShowButton = $('#importStatusShowButton');
  var importStatusReloadButton = $('#importStatusReloadButton');

  var importStatusButtonLadda
  $(document).ready(function(){
    importStatusButtonLadda = Ladda.create(
      document.getElementById('importStatusButton')
    );
  })

  var importStatusReloading = false;


  /**
   * Show import status table
   */
  var importStatusShow = function(){
    importStatusSmallBox.hide();
    importStatusFullBox.slideDown();
  }


  /**
   * Hide import status
   */
  var importStatusHide = function(){
    importStatusFullBox.slideUp(300,function(){
      importStatusSmallBox.show();
    });
  }

  var setLoadingState = function(){
    var importStatusButtonIcon = $('#importStatusButtonIcon');
    var importStatusButtonText = $('#importStatusButtonText');
    //change the status button to reloading and disable the reload button
    importStatusReloadButton.attr('disabled',true);
    importStatusButton.removeClass('btn-success');
    importStatusButton.addClass('btn-warning');
    importStatusButtonText.text('Loading');
    importStatusButtonIcon.removeClass('glyphicon-ok');
    importStatusButtonIcon.addClass('glyphicon-minus');
    importStatusButtonLadda.ladda('start');
  }
  var setErrorState = function(message){
    var importStatusButtonIcon = $('#importStatusButtonIcon');
    var importStatusButtonText = $('#importStatusButtonText');
    importStatusButton.removeClass('btn-warning');
    importStatusButton.addClass('btn-danger');
    importStatusButtonIcon.removeClass('glyphicon-minus');
    importStatusButtonIcon.addClass('glyphicon-remove');
    importStatusButtonText.attr('data-message',message);
    importStatusButtonText.text('Error');
    importStatusButtonLadda.ladda('stop');
    importStatusReloadButton.removeAttr('disabled');
  }
  /**
   * Reload the import status
   *   this is the main table load and render function that will get called by
   *   different parts of the system. it is going to use a singleton to stop
   *   users from being able to stack calls by hammering the reload button, even
   *   scripts
   * @return {boolean}
   */
  var importStatusReload = function(){
    //silently ignore stacked requests
    if(true === importStatusReloading) return true;
    setLoadingState();
    //okay now we are in a loading state lets ask the server for
    // a list of imports
    $.ajax('/file/importList',{
      contentType: 'application/json',
      type: 'POST',
      success: function(res){
        if('ok' === res.status){
          if(!res.importList || !res.importList.length){
            setTableEmpty();
            setCompleteState(false);
          } else {
            renderImportList(res.importList);
            setCompleteState(true);
          }
        } else {
          setErrorState(res.message)
        }
      }
    });
  }
  var autoTimerInterval
  var autoTimerTimeout
  var autoPauseTimeout
  var startAutoTimer = function(timeoutSeconds,interval,autoPauseSeconds){
    var importStatusButtonText = $('#importStatusButtonText');
    if(!timeoutSeconds) timeoutSeconds = 30;
    if(!autoPauseSeconds) autoPauseSeconds = timeoutSeconds * 10;
    if(!interval) interval = 1000;
    var timeoutMsecs = timeoutSeconds * 1000;
    var autoPauseMsecs = autoPauseSeconds * 1000;
    var remainingMsecs = timeoutMsecs;
    var updateTimer = function(){
      var remainingSeconds = remainingMsecs / 1000;
      importStatusButtonText.text('Refreshing in ' + remainingSeconds);
      remainingMsecs = remainingMsecs - 1000;
    }
    clearInterval(autoTimerInterval);
    autoTimerInterval = setInterval(updateTimer,interval);
    updateTimer();
    clearTimeout(autoTimerTimeout);
    autoTimerTimeout = setTimeout(function(){
      clearInterval(autoTimerInterval);
      importStatusReload();
    },timeoutMsecs);
    clearTimeout(autoPauseTimeout);
    autoPauseTimeout = setTimeout(function(){
      setPauseState();
      importStatusButton.attr('data-auto','play');
    },autoPauseMsecs);
  }
  var stopAutoTimer = function(){
    clearInterval(autoTimerInterval);
    clearTimeout(autoTimerTimeout);
    clearTimeout(autoPauseTimeout);
  }
  /**
   * Set the complete state of the status table
   * @param {boolean} liveImports Will divide auto timer by 6 when true
   */
  var setCompleteState = function(liveImports){
    if(!liveImports) liveImports = false;
    var importStatusButtonIcon = $('#importStatusButtonIcon');
    var importStatusButtonText = $('#importStatusButtonText');
    importStatusButtonLadda.ladda('stop');
    importStatusReloadButton.removeAttr('disabled');
    if('play' === importStatusButton.attr('data-auto')){
      setPlayState(!!liveImports ? 5 : 30);
    } else {
      setPauseState();
    }
  }
  var setPlayState = function(timeoutSeconds){
    if(!timeoutSeconds) timeoutSeconds = 30;
    var importStatusButtonIcon = $('#importStatusButtonIcon');
    var importStatusButtonText = $('#importStatusButtonText');
    importStatusButton.removeClass('btn-warning');
    importStatusButton.addClass('btn-success');
    importStatusButton.attr('data-auto','play');
    importStatusButtonIcon.removeClass('glyphicon-play');
    importStatusButtonIcon.addClass('glyphicon-pause');
    startAutoTimer(timeoutSeconds);
  }
  var setPauseState = function(){
    var importStatusButtonIcon = $('#importStatusButtonIcon');
    var importStatusButtonText = $('#importStatusButtonText');
    importStatusButton.removeClass('btn-success');
    importStatusButton.addClass('btn-warning');
    importStatusButton.attr('data-auto','pause');
    importStatusButtonIcon.removeClass('glyphicon-pause');
    importStatusButtonIcon.addClass('glyphicon-play');
    importStatusButtonText.text('Paused');
    stopAutoTimer();
  }
  var setTableEmpty = function(){
    var importStatusTbody = $('#importStatusTbody');
    var newRow = $(
      '<tr><td colspan="4">There are currently no import jobs.</td></tr>');
    importStatusTbody.empty();
    importStatusTbody.append(newRow);
  }
  var renderImportList = function(list){
    var rows = [];
    var importStatusTbody = $('#importStatusTbody');
    list.forEach(function(file){
      var statusDiv = ('<div class="importFileStatus" id="import-'+ file.id
        +'">' + '</div>');
      if('processing' === file.status){
        var percentComplete = (
          (file.frameComplete / file.frameTotal) * 100).toFixed(2);
        statusDiv = ('<div class="importFileStatus" id="import-'+ file.id
          +'">' + '<small class="text-muted">' +
          (file.frameDescription || file.statusDescription || 'n/a') +
          '</small>' + '</div>' +
          '<div class="progress progress-striped" style="margin-bottom: 0;">' +
          '<div class="progress-bar progress-bar-info" role="progressbar" ' +
          'aria-valuenow="' + percentComplete + '" aria-valuemin="0" ' +
          'aria-valuemax="100" style="width: ' + percentComplete + '%;">' +
          percentComplete + '%' +
          '</div>' +
          '<div>' +
          '<small class="text-muted">' +
          prettyBytes(file.frameComplete)
          + ' / ' + prettyBytes(file.frameTotal) +
          '</small>' +
          '</div>' +
          '</div>');
      } else {
        statusDiv = ('<div class="importFileStatus" id="import-'+ file.id +
          '">' + '<small class="text-muted">' +
          (file.frameDescription || 'n/a') + '</small>' + '</div>');
      }
      rows.push($(
        '<tr>' +
        '<td>' + file.name + '</td>' +
        '<td>' + file.mimeType + '</td>' +
        '<td>' + file.status + '</td>' +
        '<td>' + statusDiv + '</td>'
      ));
    })
    importStatusTbody.empty();
    rows.forEach(function(row){importStatusTbody.append(row);});
  }
  //register hide button
  importStatusHideButton.click(function(){
    importStatusHide();
  })
  //register show button
  importStatusShowButton.click(function(){
    importStatusShow();
  })
  //register reload button
  importStatusReloadButton.click(function(){
    importStatusReload();
  })
  //pause and play on auto refresh
  importStatusButton.click(function(){
    if('play' === importStatusButton.attr('data-auto')){
      setPauseState();
    } else {
      setPlayState();
    }
  })
}
