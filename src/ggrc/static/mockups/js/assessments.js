var Assessment = can.Model.LocalStorage.extend({
},{
  init: function(){
    this.name = "assessments";
    this.on('change', function(ev, prop){
      if(prop === 'text' || prop === 'complete'){
        ev.target.save();
      }
    });
  }
});

var Workflow = can.Model.LocalStorage.extend({
},{
  init: function(){
    this.name = "assessmentWorkflows";
    this.on('change', function(ev, prop){
      if(prop === 'text' || prop === 'complete'){
        ev.target.save();
      }
    });
  }
});

var Objects = [
   {type: "control", name: "Secure Backups"},
   {type: "control", name: "Data Storage"},
   {type: "control", name: "Password Security"},
   {type: "control", name: "Access Control"},
   {type: "control", name: "Stability and Perpetuability"}
];



var assessmentList = new Assessment.List({});
create_seed();
can.Component.extend({
  tag: 'assessments-app',
  scope: {
    assessments: assessmentList,
    select: function(assessment, el, ev){
      ev.preventDefault();
      $("assessment-app").trigger("selected", assessment);
      $("workflow-app").trigger("selected", assessment);
    },
    equals : function(v){
      return false;
    }
  },
  events: {
    '{Assessment} created' : function(Construct, ev, assessment){
      this.scope.attr('assessments').unshift(assessment);
    }
  }
});


can.Component.extend({
  tag: 'assessment-app',
  scope: {
    assessments : assessmentList,
    assessment: assessmentList[0],
    workflow: assessmentList[0].workflow,
    objects : [],
    Objects : Objects,
    filter : assessmentList[0].objects.length == 0,
    filter_list : [{value: assessmentList[0].program_title}],
    can_start : assessmentList[0].workflow && assessmentList[0].objects.length,
    set_fields : function(assessment){
      this.attr('filter_list', [{value: assessment.program_title}]);
      this.attr('assessment', assessment);
      this.attr('workflow', assessment.workflow);
      this.attr('can_start', this.assessment.workflow && this.assessment.objects.length)
    },
  },
  events: {
    '{Assessment} created' : function(){this.scope.set_fields(arguments[2])},
    ' selected' : function(){this.scope.set_fields(arguments[2])},
    ' workflow_selected' : function(el, ev, workflow){
      this.scope.assessment.attr('workflow', workflow).save();
      this.scope.set_fields(this.scope.assessment);
    },
    'a#saveAssessment click' : function(el, ev){
      var $modal = $('#editAssessmentStandAlone')
        , assessment = this.scope.attr('assessment');
        
        $modal.find('input').each(function(_, e){
          assessment.attr(e.name, e.value);
        });
        $modal.modal('hide');
        assessment.save();
    },
    "a#objectReview click" : function(el, ev){
      this.scope.attr('filter', false);
      this.scope.attr('objects', Objects);
    },
    "a#filterTrigger,a#filterTriggerFooter click" : function(el, ev){
      this.scope.attr('filter', true);
      this.scope.attr('objects', []);
      this.scope.assessment.attr('objects', []);
    },
    "a#addSelected click" : function(el, ev){
      var scope = this.scope
        , assessment = scope.assessment
        , selected = $('.object-check-single').map(function(_, v){return v.checked;})
        , filtered = []
        , i;
      console.log(scope.objects, 'adding')
      scope.objects.each(function(v,i){
        if(selected[i]) filtered.push(v);
      });
      assessment.attr('objects', filtered);
      assessment.save();
      scope.attr('objects', []);
      this.scope.set_fields(assessment);
    },
    "a#startAssessment click":  function(){
      $("#assessmentStart").modal('hide');
      $("a.objects_widget").trigger('click');
      this.scope.assessment.attr('started', true);
      this.scope.assessment.save();
    },
    "#objectAll click": function(el){
      $('.object-check-single').prop('checked', $(el).prop('checked'));
    },
    "#addSingleControl click": function(){
      this.scope.assessment.objects.push({name: $("#new_object_name").val(), type:$("new_object_type").val()});
      this.scope.assessment.save();
    },
    "#addFilterRule click": function(){
      this.scope.filter_list.push([{value: ""}]);
    },
    ".remove_filter click" : function(el){
      this.scope.filter_list.splice(el.data('index'), 1);
    }
  }
});

can.Component.extend({
  tag: 'workflow-app',
  name: 'workflow-app',
  edited: false,
  scope: {
    assessments : assessmentList,
    assessment: assessmentList[0],
    workflows : new Workflow.List({}),
    workflow : null,
    objectsFilter : false,
    //workflow_id : 'workflow' in assessment ? assessment.workflow : 0,
  },
  events: {
    '{Assessment} created' : function(Custruct, ev, assessment){
      this.scope.attr('assessment', assessment);
    },
    ' selected' : function(el, ev, assessment){
      this.scope.attr('assessment', assessment);
      this.scope.attr('objectsFilter', false);
      this.scope.attr('workflow_id', 'workflow' in assessment ? assessment.workflow : 0)
    },
    ' workflow_selected' : function(el, ev, workflow){
      var show_modal = this.edited;
      this.edited = false;
      if(show_modal && !workflow.confirmed){
        $('#workflowConfirm').modal('show');
        return;
      }
      this.scope.attr('workflow_id', typeof workflow !== "undefined" ? workflow.id : 0);
      this.scope.attr('workflow', workflow);
    },
    ' select_previous' : function(){
      this.edited = true;
      $("#assessmentWorkflowChoose > option[value='"+this.scope.workflow_id+"']").attr('selected', 'selected');
    },
    'input change' : function(el){
      this.edited = true;
    },
    '.add click' : function(el){
      var type = el.data('type')
        , workflow = this.scope.attr('workflow');
      workflow[type].push(type == "tasks" ? "" : {title: "", reviewer: ""});
      this.edited = true;
      //workflow.save();
    },
    '.delete click' : function(el, ev){
      ev.preventDefault();
      var type = el.data('type')
        , index = el.data('index')
        , workflow = this.scope.attr('workflow');
      
      workflow[type].splice(index, 1);
      this.edited = true;
      //workflow.save()
    },
    "a#addWorkflowNow click" : function(el, ev){
      $("assessment-app").trigger("workflow_selected", this.scope.workflow);
      if(typeof this.scope.workflow !== 'undefined' && this.scope.workflow.attr('_new')){
        this.scope.workflow.attr('_new', false);
        this.scope.workflow.save();
        
      }
      $("#setupWorkflow").modal('hide');
    },
    '.update change' : function(el, ev){
      var model = el.data('model')
        , type = el.data('type')
        , index = el.data('index')
        , workflow = this.scope.attr('workflow');
      if(model === "tasks"){
        workflow[model][index] = el.val();
      }
      else if(model === "title"){
        
        workflow.attr(model, el.val());
      }
      else{
        workflow[model][index].attr(type, el.val());
      }
    },
  },
  
  helpers: {
    
    "if_equals": function(val1, val2, options) {
      var that = this, _val1, _val2;
      function exec() {
        if(_val1 == _val2) return options.fn(options.contexts);
        else return options.inverse(options.contexts);
      }
        if(typeof val1 === "function") { 
          if(val1.isComputed) {
            val1.bind("change", function(ev, newVal, oldVal) {
              _val1 = newVal;
              return exec();
            });
          }
          _val1 = val1.call(this);
        } else {
          _val1 = val1;
        }
        if(typeof val2 === "function") { 
          if(val2.isComputed) {
            val2.bind("change", function(ev, newVal, oldVal) {
              _val2 = newVal;
              exec();
            });
          }
          _val2 = val2.call(this);
        } else {
          _val2 = val2;
        }

      return exec();
    }
  }
});
$("#addAssessmentCreated").on('click', function(ev){
  var attrs = {}, $modal =  $("#newAssessmentStandAlone");
  
  $modal.find('input').each(function(_, e){
    attrs[e.name] = e.value;
  })
  attrs['status'] = 'Pending';
  attrs['workflow'] = 0;
  attrs['objects'] = [];
  $modal.modal('hide')
  
  new Assessment(attrs).save();
});
$("#confirmChangeWorkflow").on('click', function(ev){
  ev.preventDefault();
  var id = $("#assessmentWorkflowChoose").val();
  new Workflow.List({}).each(function(v){
    if(v.id == id){
      workflow = v;
    }
  });
  if(id == "new"){
    workflow = new Workflow({_new: true, title: "", tasks: [], reviews: []});
  }
  workflow.confirmed = true;
  $("workflow-app").trigger("workflow_selected", workflow);
  $('#workflowConfirm').modal('hide');
});
$("#cancelChangeWorkflow").on('click', function(ev){
  $("workflow-app").trigger("select_previous", workflow);
});
$("#assessments-lhn").html(can.view("/static/mockups/mustache/assessments.mustache", {}))
$("#assessment-app").html(can.view("/static/mockups/mustache/assessment.mustache", {}))
$("#workflow-app").html(can.view("/static/mockups/mustache/workflow.mustache", {}))