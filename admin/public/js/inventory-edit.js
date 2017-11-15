$('#ruleAdd').click(function(){
  var rule = $('.ruleGroup').last();
  var _clone = rule.clone();
  console.log(_clone.find('div.ruleType').replaceWith($('.addNew div.ruleType').clone()));
  console.log(_clone.find('.ruleData').replaceWith($('.addNew .ruleData').clone()));
  rule.after(_clone);
  //reset the addNew template fields to untouched state?
})
$('.ruleDel').click(function(){
  var me = ($(this).parents('.ruleItem'));
  $(me).remove();
})
$('.ruleUp').click(function(){
  var me = ($(this).parents('.ruleItem'));
  var ruleItems = $('.ruleGroup > .ruleItem');
  var meIndex = ruleItems.index(me);
  $(ruleItems[meIndex]).insertBefore(ruleItems[meIndex - 1]);
})
$('.ruleDown').click(function(){
  var me = ($(this).parents('.ruleItem'));
  var ruleItems = $('.ruleGroup > .ruleItem');
  var meIndex = ruleItems.index(me);
  $(ruleItems[meIndex]).insertAfter(ruleItems[meIndex + 1]);
})
$('.ruleType').change(function(){
  var ruleSetIndex = Object.keys(ruleSet)[this.selectedIndex];
  var ruleSetDatatype = ruleSet[ruleSetIndex];
  var tgtInput = $(this).parents('.ruleItem').children('.ruleData');
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
})
