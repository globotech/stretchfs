$('#ruleAdd').click(function(){
  //var ruleItem = $('.ruleGroup > .ruleItem').last();
  //ruleItem.after(ruleItem.clone());
  // needs more element tweaking
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
  var typeClass = '.t_'+ruleSetDatatype;
  switch(ruleSetDatatype){
  case 'int':
  case 'bool':
  case 'arr':
    tgtInput.replaceWith($(typeClass).clone().removeClass(typeClass))
    break;
  default:
    console.error('ERROR: unknown ruleSetDatatype [' + ruleSetDatatype + ']');
    tgtInput.replaceWith($('.t_unknown').clone().removeClass('t_unknown'))
    break;
  }
})
