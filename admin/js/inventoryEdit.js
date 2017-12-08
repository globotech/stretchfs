'use strict';
var clickDel = function(){
  var me = ($(this).parents('.ruleItem'));
  $(me).remove();
}
var clickUp = function(){
  if(!window.ignoreClick){
    window.ignoreClick = true;
    var me = ($(this).parents('.ruleItem'));
    var ruleItems = $('.ruleGroup > .ruleItem');
    var meIndex = ruleItems.index(me);
    $(ruleItems[meIndex]).insertBefore(ruleItems[meIndex - 1]);
    window.ignoreClick = false;
  }
}
var clickDown = function(){
  if(!window.ignoreClick){
    window.ignoreClick = true;
    var me = ($(this).parents('.ruleItem'));
    var ruleItems = $('.ruleGroup > .ruleItem');
    var meIndex = ruleItems.index(me);
    $(ruleItems[meIndex]).insertAfter(ruleItems[meIndex + 1]);
    window.ignoreClick = false;
  }
}
var changeRule = function(e){
  if(!window.ignoreClick){
    window.ignoreClick = true;
    var that = e.target;
    var ruleSetIndex = Object.keys(window.ruleSet)[that.selectedIndex];
    var ruleSetDatatype = window.ruleSet[ruleSetIndex];
    var tgtInput = $(that).parents('.ruleItem').children('.ruleData');
    var typeClass = 't_'+ruleSetDatatype;
    switch(ruleSetDatatype){
    case 'int':
    case 'bool':
    case 'arr':
      var src = $('.'+typeClass).clone();
      src.removeClass(typeClass);
      tgtInput.replaceWith(src);
      break;
    default:
      console.error('ERROR: unknown ruleSetDatatype [' + ruleSetDatatype + ']');
      tgtInput.replaceWith($('.t_unknown').clone().removeClass('t_unknown'));
      break;
    }
    window.ignoreClick = false;
  }
}
var mapEvents = function(){
  $('.ruleDel').click(clickDel);
  $('.ruleUp').click(clickUp);
  $('.ruleDown').click(clickDown);
  $('.ruleType').change(changeRule);
}


/**
 * Export mapEvents
 * @type {mapEvents}
 */
window.mapEvents = mapEvents;


/**
 * Inventory Edit
 */
var inventoryEdit = function(){
  window.ignoreClick = false;
  $.getJSON('/inventory/listRuleTypes')
    .done(function(jqXHR){
      if(jqXHR.isFulfilled) window.ruleSet = jqXHR.fulfillmentValue;
      $('#ruleAdd').click(function(){
        if(!window.ignoreClick){
          window.ignoreClick = true;
          var rule = $('.ruleGroup').last();
          var _clone = rule.clone();
          var cloneType = $('.addNew .ruleType').clone();
          var cloneValue = $('.addNew .ruleData').clone();
          //console.log(cloneType,cloneValue);
          cloneValue[0].name = 'rule[' +
            ($('.ruleGroup').index(rule)+1) +
            '][' +
            ($('.addNew .ruleType').val()) +
            ']'
          ;
          _clone.find('.ruleType').replaceWith(cloneType);
          _clone.find('.ruleData').replaceWith(cloneValue);
          rule.after(_clone);
          $('.ruleGroup').last().find('.ruleType').get(0).selectedIndex = $('.addNew .ruleType').get(0).selectedIndex;
          mapEvents();
          //TODO: reset the addNew template fields to untouched state?
          window.ignoreClick = false;
        }
      });
      mapEvents();
    })
    .fail(function(jqXHR,textStatus,error){
      var err = textStatus + ', ' + error;
      console.log('Request Failed: ' + err);
      window.ignoreClick = false;
      window.location.reload(true);
    });
}


/**
 * Export inventory edit
 * @type {inventoryEdit}
 */
window.inventoryEdit = inventoryEdit;
