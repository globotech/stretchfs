var clickDel = function(){
  var me = ($(this).parents('.ruleItem'));
  $(me).remove();
}
var clickUp = function(){
  var me = ($(this).parents('.ruleItem'));
  var ruleItems = $('.ruleGroup > .ruleItem');
  var meIndex = ruleItems.index(me);
  $(ruleItems[meIndex]).insertBefore(ruleItems[meIndex - 1]);
}
var clickDown = function(){
  var me = ($(this).parents('.ruleItem'));
  var ruleItems = $('.ruleGroup > .ruleItem');
  var meIndex = ruleItems.index(me);
  $(ruleItems[meIndex]).insertAfter(ruleItems[meIndex + 1]);
}
var changeRule = function(e){
  var that = e.target;
  var ruleSetIndex = Object.keys(window.ruleSet)[that.selectedIndex];
  var ruleSetDatatype = window.ruleSet[ruleSetIndex];
  var tgtInput = $(that).parents('.ruleItem').children('.ruleData');
  var typeClass = 't_'+ruleSetDatatype;
  switch(ruleSetDatatype){
  case 'int':
  case 'bool':
  case 'arr':
    tgtInput.replaceWith($('.'+typeClass).clone().removeClass(typeClass));
    break;
  default:
    console.error('ERROR: unknown ruleSetDatatype [' + ruleSetDatatype + ']');
    tgtInput.replaceWith($('.t_unknown').clone().removeClass('t_unknown'));
    break;
  }
}
var mapEvents = function(){
  $('.ruleDel').click(clickDel);
  $('.ruleUp').click(clickUp);
  $('.ruleDown').click(clickDown);
  $('.ruleType').change(changeRule);
}
$(document).ready(function(){
  $.getJSON('/inventory/listRuleTypes')
    .done(function(jqXHR){
      if(jqXHR.isFulfilled) window.ruleSet = jqXHR.fulfillmentValue;
      mapEvents();
      $('#ruleAdd').click(function(){
        var rule = $('.ruleGroup').last();
        var _clone = rule.clone();
        _clone.find('div.ruleType').replaceWith($('.addNew div.ruleType').clone());
        _clone.find('.ruleData').replaceWith($('.addNew .ruleData').clone());
        rule.after(_clone);
        mapEvents();
        //TODO: reset the addNew template fields to untouched state?
      });
    })
    .fail(function(jqXHR,textStatus,error){
      var err = textStatus + ', ' + error;
      //TODO: handle this better (reload page?)
      console.log('Request Failed: ' + err);
    });
});
