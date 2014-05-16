// LHN
can.Component.extend({
  tag: 'lhn-app',
  scope: {
    assessments: assessmentList,
    programs: ProgramList,
    tasks: taskList,
    select: function(object, el, ev){
      ev.preventDefault();
      $("tree-app").trigger('selected', object);
      resize_areas();
    },
  },
  events: {
    '{Assessment} created' : function(Construct, ev, assessment){
      this.scope.attr('assessments').unshift(assessment);
    },
    '{Task} created' : function(Construct, ev, tasks){
      this.scope.attr('tasks').unshift(tasks);
    }
  }
});

can.Component.extend({
  tag: 'tree-app',
  scope: {
    object: assessmentList[0]//ProgramList[0]//assessmentList[0]
  },
  events: {
    '{window} selected' : function(el, ev, object){
      this.scope.attr('object', object);
    },
    '{window} click' : function(el, ev){
      if(!$(ev.target).hasClass('to-my-work') && !$(ev.target).hasClass('to-control')) return;
      var type = $(ev.target).hasClass('to-my-work') ? 'my-work' : 'control';
      $("tree-app").trigger('selected', {name: type});
      $(".active").removeClass('active');
      $('.'+type+'-widget').show();
    },
  },
  helpers: {

    "hide_class": function(val, object, options) {
      var name = object().name;
      if(name === val)
        return '';
      else
        return 'hide';
    }
  },
});

can.Component.extend({
  tag: 'selector-modal',
  scope: {
    filter_list : [{value: assessmentList[0].program_title}],
    filter : true,
    objects: [],
    model: assessmentList[0],
    source: Objects,
    mapping: 'Objects',

  },
  events: {
    "{window} selected" : function(el, ev, object){
      this.scope.attr('model', object);
    },
    '{Assessment} updated' : function(){this.scope.attr('model', arguments[2])},
    '{Assessment} created' : function(){this.scope.attr('model', arguments[2])},
    '{window} click' : function(el, ev){
      var $el = $(ev.target);
      if(!$el.hasClass('selector-modal')) return;

      var mapping = $el.data('mapping');
      this.scope.attr('mapping', mapping.charAt(0).toUpperCase() + mapping.slice(1));
      this.scope.attr('objects', []);
      if(mapping === 'objects'){
        this.scope.attr('source', Objects);
        this.scope.attr('filter', true);
        this.scope.attr('objects', []);
      }
      else if(mapping === 'people'){
        this.scope.attr('source', People);
        this.scope.attr('filter', false);
        this.scope.attr('objects', People);
      }
      else if(mapping === 'tasks'){
        this.scope.attr('source', taskList);
        this.scope.attr('filter', false);
        this.scope.attr('objects', taskList);
      }
      this.scope.attr('selected_num', this.scope.attr('objects').length);
    },
    "a#objectReview click" : function(el, ev){
      var type = $("#objects_type").val().toLowerCase()
        , that = this
        , objects = this.scope.model[this.scope.mapping.toLowerCase()]
        ;

      this.scope.attr('objects', this.scope.source[type]);
      this.scope.attr('selected_num', this.scope.attr('objects').length);
      $('.results .info').css('display', 'none');
    },
    "a#filterTrigger,a#filterTriggerFooter click" : function(el, ev){
      this.scope.attr('filter', true);
      this.scope.attr('objects', []);
      this.scope.model.attr('objects', []);
    },
    "a#addSelected click" : function(el, ev){
      var scope = this.scope
        , model = scope.model
        , mapping = scope.mapping.toLowerCase()
        , selected = $('.object-check-single').map(function(_, v){ return v.checked; })
        , filtered = []
        , i;
      if(!scope.objects.length) return;
      if(mapping == 'objects'){
        var type = scope.objects[0].type;
        model.attr(mapping, $.map(model[mapping], function(o){
          if(o.type !== type) return o;
        }));
      }
      else{
        model.attr(mapping, []);
      }
      scope.objects.each(function(v,i){
        if(selected[i]) model[mapping].push(v);
      });
      model.save();
      scope.attr('objects', []);
    },
    "#objectAll click": function(el){
      var $el = $(el)
        , $check = $(this.element).find('.object-check-single');
      $check.prop('checked', $el.prop('checked'));
      if($el.prop('checked')){
        this.scope.attr('selected_num', this.scope.attr('objects').length);
      }
      else{
        this.scope.attr('selected_num', 0);
      }
      $check.each(function(i, c){
        if($el.is(':checked')) {
          $(c).closest('.tree-item').removeClass('disabled');
        } else {
          $(c).closest('.tree-item').addClass('disabled');
        }
      })
    },
    '.object-check-single click' : function(el, ev){
      var $modal = $("#objectSelector")
        , num_checked = $modal.find('.object-check-single').map(function(_,c){
        if($(c).is(':checked')){
          return c;
        }
      }).length;
      ev.stopPropagation();
      this.scope.attr('selected_num', num_checked);
    },
    "#addFilterRule click": function(){
      this.scope.filter_list.push([{value: ""}]);
    },
  }
})

// Workflow Tree
can.Component.extend({
  tag: 'workflow',
  init: function(){
    var that = this;
    $(function(){
      that.scope.initAutocomplete();
    })
  },
  scope: {
    assessments : assessmentList,
    assessment: assessmentList[0],
    objects : [],
    selected_num : 0,
    set_fields : function(assessment){
      this.attr('filter_list', [{value: assessment.program_title}]);
      this.attr('assessment', assessment);
      this.initAutocomplete();
    },
    initAutocomplete : function(){
      $( ".date" ).datepicker();
      $(".sortable").sortable({
        update: function(event, ui){
          $("workflow").trigger("sorted", event.target);
        },

      });
      var that = this
        , lists = {
        objects : $.map(this.assessment.objects, function(o){
          return o.name;
        }),
        people : [
          "Vladan Mitevski",
          "Predrag Kanazir",
          "Dan Ring",
          "Silas Barta",
          "Cassius Clay",
        ],
        mapped_people : $.map(this.assessment.people, function(o){
          return o.name;
        }),
        tasks: $.map(this.assessment.tasks, function(o){
          return o.title;
        }),
      }
      $('.item-main input').on('click', function(ev){
        ev.stopPropagation();
      });
      $('.autocomplete').each(function(i,el){
        var $el = $(el)
          , autocomplete_type = $el.data('autocomplete-type')
          , type = autocomplete_type || $el.data('type')
        if(type === 'mapped_people'){
          $el.on('focus', function(){
            $el.attr('placeholder', 'Search for Assignee');
          })
          $el.on('blur', function(){
            $el.attr('placeholder', 'Choose Assignee');
          })
        }
        $el.autocomplete({
          source : function(request, response){
            var search = type;
            if(type === 'mapped_people' && $el.val() !== ''){
              search = 'people';
            }
            var list = $.map(lists[search], function(v){
              if(v.indexOf(request.term) > -1){
                return v;
              }
            });
            list.push("+ Create New");
            response(list);
            $('.ui-autocomplete.ui-menu').each(function(_, el){
              $(el).children().last().find('a').css({'text-decoration': 'underline', 'color': '#0088cc ! important'});
            })
          },
          close: function( event, ui ) {
            if($el.val() !== '+ Create New'){
              $el.trigger('change');
              if(type === 'mapped_people' && $el.val() !== ''){
                var people = that.assessment.people
                  , should_add = true
                for(var i=0; i < people.length; i++){
                  if($el.val() === people[i].name){
                    should_add = false;
                  }
                }
                if(should_add){
                  that.assessment.people.push({
                    name: $el.val(),
                    type: 'person',
                  });
                }
              }
              return;
            }
            $el.val('');
            if(type === 'tasks'){
              $modal = $('#newTask');
              $('.show-task-modal').trigger('click');
              $modal.data('autocomplete', true);
              var num_tasks = taskList.length;
              $modal.on('hide.bs.modal', function(){
                $modal.unbind('hide.bs.modal');
                $modal.data('autocomplete', false);
                if(taskList.length > num_tasks){
                  that.assessment.tasks.push(taskList[0]);
                  that.assessment.save();
                  $el.val(taskList[0].title);
                  $el.trigger('change');
                }
              })
            }
          },
          minLength: 0
        }).focus(function(){
          //Use the below line instead of triggering keydown
          $(this).data("uiAutocomplete").search($(this).val());
      }).data('ui-autocomplete');
      });
    },
  },
  events: {
    '{Assessment} created' : function(){this.scope.set_fields(arguments[2])},
    '{Assessment} updated' : function(){
      this.scope.initAutocomplete();
    },
    ' sorted' : function(_,_,ul){
      var $ul = $(ul)
        , list = $ul.find('input')
        , index = $ul.data('index')
        , workflow = this.scope.assessment
        , tg = workflow.task_groups[index]
        , tasks = tg.tasks.slice()
        , i = 0;
      if($($ul[0]).find('.disabled').length){
        $( ".sortable" ).sortable( "cancel" );
        return;
      }
      var a = list.map(function(i,e){
        return $(e).val();
      });
      for(i=0; i < a.length; i+=2){
        tasks[Math.floor(i/2)].attr('title', a[i]);
        tasks[Math.floor(i/2)].attr('end_date', a[i+1]);
      }
      // Now that the list is sorted cancel the sortable event
      workflow.save();
      $( ".sortable" ).sortable( "cancel" );

    },
    '{window} selected' : function(){
      this.scope.set_fields(arguments[2]);
      $('.widget').hide();
      $('.active').removeClass('active');
      $('ul.workflow-nav > li').first().addClass('active');
      $('.workflow-info-widget').show();

    },
    ".addEntry click" : function(el){
      var object_id = el.closest('.object-top').data('index')
        , task_id = el.data('index')
        , textarea = el.parent().find('textarea').first()
        , value = textarea.val()
        , objects = el.data('objects')
        , list = objects === 'tasks' ? 'entries' : 'notes' ;
      el.closest(".add-entry").hide();
      el.parent().next().show();
      this.scope.assessment.objects[object_id][objects][task_id][list].push({content: value});
      this.scope.assessment.save();
      textarea.val('');
    },
    ".startObjectNow click" : function(el){
      var object_id = el.closest('.object-top').data('index')
        , type = el.data('type')
        , id = el.data('id')
        , status = el.data('status')
        , can_finish = true
        , state = type === 'tasks' ? 'task_state' : 'review_state'
        , object = this.scope.assessment.objects[object_id]
        ;
      if(type === 'object')
        object.attr('status', status);
      else{
        object[type][id].attr(state, status);
      }
      // Check if the finish button can be enabled:
      object.tasks.each(function(v){
        if(v.task_state !== 'rq-accepted'){
          can_finish = false;
        }
      });
      object.reviews.each(function(v){
        if(v.review_state !== 'rq-responded'){
          can_finish = false;
        }
      });
      object.attr('can_finish', can_finish)
      this.scope.assessment.save();
    },
    ".remove_filter click" : function(el){
      this.scope.filter_list.splice(el.data('index'), 1);
    },
    ".reset_filter click" : function(){
      this.scope.attr('filter_list', [{value: this.scope.assessment.program_title}]);
    },
    ".show_review click" : function(el){
      $(el).parent().hide();
      $(el).parent().prev().show();
    },

    // Task groups:
    "#addTaskGroup click" : function(){
      var title = $("#new_object_name").val()
        , assignee = $("#new_task_assignee").val()
        , end_date = $("#tg_end_date").val()
        , assessment = this.scope.assessment;
      if(!assessment.task_groups){
        assessment.attr('task_groups', []);
      }
      if(title === '' || assignee === '' || end_date === '') return;
      $('#addSingleObject').hide();
      $('#objectFooterUtility').show();
      $("#new_object_name").val('')
      $("#tg_end_date").val('')
      assessment.task_groups.push({
        title: title,
        description: "",
        assignee: assignee,
        objects: [],
        tasks: [],
        end_date: end_date,
        taskLock: false
      });
      assessment.save();
      $('.task-group-index').last().find('.openclose').trigger('click');
    },
    ".removeTaskGroup click" : function(el, ev){
      var assessment = this.scope.assessment
        , index = $(el).data('index')
        ;
      assessment.task_groups.splice(index, 1);
      assessment.save();
    },
    ".saveTaskGroupField change" : function(el, ev){
      var assessment = this.scope.assessment
        , $el = $(el)
        , index = $el.data('index')
        , field = $el.data('field')
        ;
      assessment.task_groups[index].attr(field, $el.val());
      assessment.save();
    },
    ".toggleClosest click" : function(el, ev){
      var $el = $(el)
        , hide = $el.parent()
        , show = $el.parent().siblings()
      hide.hide();
      show.show();
    },
    ".addTrigger click" : function(el, ev){
      var $el = $(el)
        , assessment = this.scope.assessment
        , index = $el.data('index')
        , type = $el.data('type')
        ;
      if($el.hasClass('disabled')) return;
      if(type === 'tasks'){
        assessment.task_groups[index][type].push({title: "", end_date: assessment.task_groups[index].end_date});
      }
      else{
        assessment.task_groups[index][type].push({title: ""});
      }

      assessment.save();
    },
    ".deleteTrigger click" : function(el, ev){
      var $el = $(el)
        , assessment = this.scope.assessment
        , index = $el.data('index')
        , workflowIndex = $el.closest('ul').data('index')
        , type = $el.data('type')
        ;
      if($el.hasClass('disabled')) return;
      assessment.task_groups[workflowIndex][type].splice(index, 1);
      assessment.save();
    },
    ".taskLock change" : function(el, ev){
      var $el = $(el)
        , index = $el.data('index')
        , assessment = this.scope.assessment
        , task_group = assessment.task_groups[index]
        ;
      task_group.attr('taskLock', $el.is(':checked'));
      assessment.save();
    },
    ".editTitle change" : function(el, ev){
      var $el = $(el)
        , assessment = this.scope.assessment
        , index = $el.data('index')
        , workflowIndex = $el.closest('ul').data('index')
        , type = $el.data('type')
        ;
      if($el.hasClass('disabled')) return;
      assessment.task_groups[workflowIndex][type][index].attr('title', $el.val());
      assessment.save();
    },
    ".editDate change" : function(el, ev){
      var $el = $(el)
        , assessment = this.scope.assessment
        , index = $el.data('index')
        , workflowIndex = $el.closest('ul').data('index')
        , type = $el.data('type')
        ;
      if($el.hasClass('disabled')) return;
      assessment.task_groups[workflowIndex][type][index].attr('end_date', $el.val());
      assessment.save();
    },
    "#confirmStartWorkflow click" : function(el, ev){
      var assessment = this.scope.assessment
        , task_groups = this.scope.assessment.task_groups

      for(var i = 0; i < task_groups.length; i++){
        var tg = task_groups[i]
          , objects = tg.objects
          , tasks = tg.tasks
        for(var j =0; j < objects.length; j++){
          var original_objects = $.map(assessment.objects, function(o){
            if(o.name === objects[j].title){
              return o;
            }
          });
          if(original_objects.length === 0) continue;
          objects[j].attr('type', original_objects[0].type);
          objects[j].attr('obj_tasks', new can.List());
          for(var k = 0; k < tasks.length; k++){
            for(var l = 0; l < taskList.length; l++){
              if(taskList[l].title === tasks[k].title){
                objects[j].obj_tasks.push(new can.Observe({
                  title: taskList[l].title,
                  description: taskList[l].description,
                  id: taskList[l].id,
                  status: 'assigned',
                  end_date: tasks[k].end_date,
                  entries: can.List(),
                }));
              }
            }
          }
        }
      }
      assessment.attr('status', 'Started');
      assessment.attr('started', true);
      assessment.save();
    },
    ".change-task-status click" : function(el){

      var t = $(el.closest('.obj_task')).data('index')
        , o = $(el.closest('.tg_object')).data('index')
        , tg = $(el.closest('.task_group')).data('index')
        , oc = $(el.closest('.obj_task')).find('.openclose')
        , assessment = this.scope.assessment
        , task_groups = assessment.task_groups
        , task_group = task_groups[tg]
        , objects = task_group.objects
        , object = objects[o]
        , tasks = object.obj_tasks
        , task = tasks[t]
        , all_done = true
        , status = task.attr('status')
        ;

      switch(status){
        case "assigned":
          task_group.attr('status', 'started');
          object.attr('obj_status', 'started');
          task.attr('status', 'started');
          assessment.attr('status', 'In progress');
          oc.openclose('open');
          break;
        case "started":
          task.attr('status', 'finished');
          break;
        case "finished":
          task.attr('status', 'verified');
          // Check if all tasks are done:
          for(var i=0; i < tasks.length; i++){
            if(tasks[i].status !== 'verified'){
              all_done = false;
            }
          }
          object.attr('obj_status', all_done ? 'finished' : object.attr('obj_status'));
          // Check if all objects are done:
          all_done = true;
          for(var i=0; i < objects.length; i++){
            if(objects[i].obj_status !== 'finished'){
              all_done = false;
            }
          }
          task_group.attr('status', all_done ? 'finished' : task_group.attr('status'));
          break;
      }
      assessment.save();
    },
    '.add-entry-btn click' : function(el){
      var task = $(el.closest('.obj_task')).data('index')
        , object = $(el.closest('.tg_object')).data('index')
        , task_group = $(el.closest('.task_group')).data('index')
        , assessment = this.scope.assessment
        , obj_task = assessment.task_groups[task_group].objects[object].obj_tasks[task]
        , value = $(el.siblings()[0]).val()
        ;
      $(el.siblings()[0]).val('');
      obj_task.entries.push({description: value});
      assessment.save();
    },
    '.delete-entry-btn click' : function(el){
      var entry = $(el).data('index')
        , task = $(el.closest('.obj_task')).data('index')
        , object = $(el.closest('.tg_object')).data('index')
        , task_group = $(el.closest('.task_group')).data('index')
        , assessment = this.scope.assessment
        , obj_task = assessment.task_groups[task_group].objects[object].obj_tasks[task]
        , value = $(el.siblings()[0]).val()
        ;

      obj_task.entries.splice(entry, 1);
      assessment.save();
    },
    '.end-workflow click' : function(){
      $('.workflow-group').addClass('finished');
      setTimeout(function(){
        $('.workflow-group').removeClass('finished');
      }, 500);
      this.scope.assessment.attr('finished', true);
      this.scope.assessment.attr('status', 'Finished');
      this.scope.assessment.save();
    },
    ".unmap click" : function(el){
      var $el = $(el)
        , index = $el.data('index')
        , type = $el.data('type')
        , $ul = $el.closest('ul')
        ;
      this.scope.assessment[type].splice(index, 1);
      this.scope.assessment.save();
      if($ul.find('.item-open').length === 0){
        $ul.removeClass('tree-open');
      }
    },
    "#cloneWorkflowSave click": function(el, ev){
      var $modal = $("#cloneWorkflow")
        , title = $modal.find('input[name=title]').first().val()
        , owner = $modal.find('input[name=lead_email]').first().val()
        , checkboxes = $modal.find('input[type=checkbox]')
        , workflow = this.scope.assessment
        , clone = new Assessment();

      clone.attr('title', title);
      clone.attr('lead_email', owner);
      clone.attr('end_date', workflow.attr('end_date'));
      clone.attr('status', 'Future');
      checkboxes.each(function(_, el){
        var $el = $(el)
          , checked = $el.is(':checked')
          , type = $el.data('type')
          ;
        if(!checked) return;
        if(type !== 'task_groups'){
          clone.attr(type, workflow.attr(type).slice());
          return;
        }

        clone.attr('task_groups', new can.List());
        var tgs = workflow.attr(type);
        for(var i = 0; i < tgs.length; i++){
          clone.task_groups.push({
            objects: $.map(tgs[0].objects, function(e){ return {title: e.title}; }),
            tasks: $.map(tgs[0].tasks, function(e){ return {title: e.title, end_date: e.end_date}; }),
            assignee: tgs[0].assignee,
            description: tgs[0].description,
            end_date: tgs[0].end_date,
            title: tgs[0].title
          })
        }
      });
      $("tree-app").trigger('selected', clone);
      $modal.modal('hide');
      clone.save();
      return;
    },
  }
});

can.Component.extend({
  tag: 'task',
  scope: {
    task: taskList[0],
  },
  events: {
    '{Task} created' : function(){
      this.scope.attr('task', arguments[2]);
    },
    '{Task} updated' : function(){
    },
    '{window} selected' : function(){
      this.scope.attr('task', arguments[2]);
      $('.task_info_widget').show();
    },
  }
})

// TODO: seperate common modal functionality
can.Component.extend({
  tag: 'workflow-modal',
  scope: {
    assessment: assessmentList[0],
    new_form: false,
    currentUser : 'user@example.com',
    set_fields : function(assessment){
      this.attr('filter_list', [{value: assessment.program_title}]);
      this.attr('assessment', assessment);
      this.validateForm();
    },
    "new" : function(val, val_old){
      this.validateForm();
      if(this.attr('new_form')) return arguments.length === 3 ? val_old() : '';
      return val();
    },
    validateForm : function(){
      var $modal = $("#editAssessmentStandAlone")
        , required_fields = $modal.find('input.required')
        , $save_button = $("#saveAssessment")
        , empty_fields = $.map(required_fields, function(f){
            if($(f).val()){
              return f;
            }
          })
      if(required_fields.length === empty_fields.length){
        $save_button.removeClass('disabled');
      }
      else{
        $save_button.addClass('disabled');
      }
    }
  },
  events:{
    '{window} click' : function(el, ev){
      if(!$(ev.target).hasClass('show-workflow-modal')) return;
      this.scope.attr('new_form', $(ev.target).data('new'));
    },
    'a#saveAssessment click' : function(el, ev){
      var $modal = $('#editAssessmentStandAlone')
        , assessment = this.scope.attr('new_form') ? new Assessment({}) : this.scope.attr('assessment');

      if($(el).hasClass('disabled'))return;
      $modal.find('input').each(function(_, e){
        assessment.attr(e.name, e.value);
      });
      $modal.find('textarea').each(function(_, e){
        assessment.attr(e.name, $(e).val());
      });
      $modal.modal('hide');
      if(typeof assessment.objects === 'undefined'){
        assessment.attr('objects', []);
        assessment.attr('people', []);
        assessment.attr('tasks', []);
      }
      if(typeof assessment.task_groups === 'undefined'){
        assessment.attr('task_groups', []);
      }
      assessment.save();
      $("tree-app").trigger("selected", this.scope.assessment);

    },
    '{Assessment} created' : function(){
      this.scope.attr('assessment', arguments[2]);
    },
    '{window} selected' : function(){
      this.scope.attr('assessment', arguments[2]);
    },
    'input,textarea change' : function(){
      this.scope.validateForm();
    },
    'input,textarea keyup' : function(){
      this.scope.validateForm();
    }
  }
});

var modal = can.Component.extend({
  tag: 'task-modal',
  scope: {
    task: taskList[0],
    new_form: false,
    currentUser : 'user@example.com',
    new : function(val, val_old){
      if(this.attr('new_form')) return arguments.length === 3 ? val_old() : '';
      return val();
      this.validateForm();
    },
    validateForm : function(){
      var $modal = $("#newTask")
        , required_fields = $modal.find('input.required')
        , $save_button = $("#addTask")
        , empty_fields = $.map(required_fields, function(f){
            if($(f).val()){
              return f;
            }
          })
      if(required_fields.length === empty_fields.length){
        $save_button.removeClass('disabled');
      }
      else{
        $save_button.addClass('disabled');
      }
    }
  },
  events:{
    '{window} click' : function(el, ev){
      this.scope.validateForm();
      var $el = $(ev.target).hasClass('show-task-modal') ? $(ev.target) : $(ev.target).parent()
      if(!$el.hasClass('show-task-modal')) return;
      this.scope.attr('new_form', $el.data('new'));
    },
    'a#addTask click' : function(el, ev){
      var $modal = $('#newTask')
        , task = this.scope.attr('new_form') ? new Task({}) : this.scope.attr('task');

      if($(el).hasClass('disabled'))return;
      $modal.find('input').each(function(_, e){
        task.attr(e.name, e.value);
      });
      $modal.find('textarea').each(function(_, e){
        task.attr(e.name, $(e).val());
      });
      task.save();
      if(!$modal.data('autocomplete'))
        $("tree-app").trigger("selected", this.scope.task);
      $modal.modal('hide');

    },

    '{Task} created' : function(){
      this.scope.attr('task', arguments[2]);
    },
    '{window} selected' : function(){
      this.scope.attr('task', arguments[2]);
      this.scope.validateForm();
    },
    'input,textarea change' : function(){
      this.scope.validateForm();
    },
    'input,textarea keyup' : function(){
      this.scope.validateForm();
    }
  }
});

$("#lhn-automation").html(can.view("/static/mockups/mustache/v1.1/lhn.mustache", {}))
$("#tree-app").html(can.view("/static/mockups/mustache/v1.1/tree.mustache", {}))
$("#workflow").html(can.view("/static/mockups/mustache/v1.1/workflow.mustache", {}));
$("#my-work").html(can.view("/static/mockups/mustache/v1.1/my-work.mustache", {}));
$("#control").html(can.view("/static/mockups/mustache/v1.1/control.mustache", {}));
$("#task").html(can.view("/static/mockups/mustache/v1.1/task.mustache", {}));
$("#workflow-modal").html(can.view("/static/mockups/mustache/v1.1/workflow-modal.mustache", {}));
$("#task-modal").html(can.view("/static/mockups/mustache/v1.1/task-modal.mustache", {}));
$("#selector-modal").html(can.view("/static/mockups/mustache/v1.1/selector-modal.mustache", {}));
