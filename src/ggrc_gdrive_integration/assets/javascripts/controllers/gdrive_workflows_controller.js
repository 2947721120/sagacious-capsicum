/*
 * Copyright (C) 2013-2014 Google Inc., authors, and contributors <see AUTHORS file>
 * Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
 * Created By: brad@reciprocitylabs.com
 * Maintained By: brad@reciprocitylabs.com
 */
(function(can, $) {
var create_folder = function(cls, title_generator, parent_attr, model, ev, instance) {
  var that = this
  , dfd
  , folder
  , has_parent = true
  , owner = cls === CMS.Models.Request ? "assignee" : "contact";

  if(instance instanceof cls) {
    if(parent_attr) {
      dfd = instance[parent_attr].reify().get_binding("folders").refresh_instances();
    } else {
      has_parent = false;
      dfd = $.when([{}]); //make parent_folder instance be undefined; 
                          // GDriveFolder.create will translate that into 'root'
    }
    return dfd.then(function(parent_folders) {
      parent_folders = can.map(parent_folders, function(pf) {
        return pf.instance && pf.instance.userPermission &&
          (pf.instance.userPermission.role === "writer" || 
           pf.instance.userPermission.role === "owner") ? pf : undefined;
      });
      if(has_parent && parent_folders.length < 1){
        return new $.Deferred().reject("no write permissions on parent");
      }
      var xhr = new CMS.Models.GDriveFolder({
        title : title_generator(instance)
        , parents : parent_folders.length > 0 ? parent_folders[0].instance : undefined
      }).save();

      report_progress("Creating Drive folder for " + title_generator(instance), xhr);
      return xhr;
    }).then(function(created_folder) {
      var refresh_queue;
      
      folder = created_folder;

      return report_progress(
        'Linking folder "' + folder.title + '" to ' + instance.constructor.title_singular
        , new CMS.Models.ObjectFolder({
          folder : folder
          , folderable : instance
          , context : instance.context || { id : null }
        }).save()
      );
    }).then($.proxy(instance, "refresh"))
    .then(function() {
      if(!(instance instanceof CMS.Models.Audit)) {
        return that.update_permissions(model, ev, instance);  //done automatically on refresh for Audits
      }
    }).then(function(){
      return folder;
    }, function() {
      //rejected case from previous
      return $.when();
    });
  }
  else {
    dfd = new $.Deferred();
    return dfd.reject("Type mismatch");
  }
};

function partial_proxy(fn) {
  var args = can.makeArray(arguments).slice(1);
  return function() {
    return fn.apply(this, args.concat(can.makeArray(arguments)));
  };
}

var allops = [];
function report_progress(str, xhr) {

  function build_flashes() {
    var flash = {}
    , successes = []
    , failures = []
    , pendings = [];

    can.each(allops, function(op) {
      switch(op.xhr.state()) {
        case "resolved":
        successes.push(op.str + " -- Done<br>");
        break;
        case "rejected":
        failures.push(op.str + " -- FAILED<br>");
        break;
        case "pending":
        pendings.push(op.str + "...<br>");
      }
    });

    if(successes.length) {
      flash.success = successes;
    }
    if(failures.length) {
      flash.error = failures;
    }
    if(pendings.length) {
      flash.warning = pendings.concat(["Please wait until " + (pendings.length === 1 ? "this operation completes" : "these operations complete")]);
    } else {
      setTimeout(function() {
        if(can.map(allops, function(op) {
          return op.xhr.state() === "pending" ? op : undefined;
        }).length < 1) {
          allops = [];
        }
      }, 1000);
    }
    $(document.body).trigger("ajax:flash", flash);
  }

  allops.push({str : str, xhr : xhr});
  xhr.always(build_flashes);
  build_flashes();
  return xhr;
}

var permissions_by_type = {
  "Program" : {
    "owners" : "writer"
    , "contact" : "writer"
  }
  , "Audit" : {
    "contact" : "writer"
    , "findAuditors" : "reader"
  }
  , "Request" : {
    "assignee" : "writer"
  }
};

can.Control("GGRC.Controllers.GDriveWorkflow", {

}, {
  request_create_queue : []
  , user_permission_ids : {}

  , create_program_folder : partial_proxy(create_folder, CMS.Models.Program, function(inst) { return inst.title + " Audits"; }, null)
  /*
    NB: We don't do folder creation on Program creation now.  Only when the first Audit is created does the Program folder
    get created as well.
  */

  , create_audit_folder : partial_proxy(create_folder, CMS.Models.Audit, function(inst) { return inst.title; }, "program")
  , "{CMS.Models.Audit} created" : function(model, ev, instance) {
    if(instance instanceof CMS.Models.Audit) {
      var that = this;
      this._audit_create_in_progress = true;
      instance.delay_resolving_save_until(
         instance.program.reify().refresh()
        .then(this.proxy("create_folder_if_nonexistent"))
        .then($.proxy(instance.program.reify(), "refresh"))
        .then(function() {
          return that.create_audit_folder(model, ev, instance);
         })
        .always(function(){
          delete that._audit_create_in_progress;
        })
      );
    }
  }

  // if we had to wait for an Audit to get its own folder link on creation, we can now do the delayed creation
  //  of folder links for the audit's requests, which were created first in the PBC workflow
  , "{CMS.Models.ObjectFolder} created" : function(model, ev, instance) {
    var i, that = this, folderable, create_deferreds = [];
    if(instance instanceof CMS.Models.ObjectFolder && (folderable = instance.folderable.reify()) instanceof CMS.Models.Audit) {
      instance.delay_resolving_save_until(
        folderable.refresh().then(function() {
          return folderable.get_binding("folders").refresh_instances().then(function() {
            for(i = that.request_create_queue.length; i--;) {
              if(that.request_create_queue[i].audit.reify() === instance.folderable.reify()) {
                if(that.request_create_queue[i].objective) {
                  create_deferreds.push(that.create_request_folder(CMS.Models.Request, ev, that.request_create_queue[i]));
                } else {
                  var dfd = new CMS.Models.ObjectFolder({
                    folder_id : instance.folder_id
                    , folderable : that.request_create_queue[i]
                    , context : that.request_create_queue[i].context || { id : null }
                  }).save();
                  create_deferreds.push(dfd);
                  report_progress(
                    'Linking new Request to Audit folder'
                    , dfd
                  );
                }
                that.request_create_queue.splice(i, 1);
              }
            }
            return $.when.apply($, create_deferreds);
          });
        })
      );
    }
  }

  // When creating requests as part of audit workflow, wait for audit to have a folder link before
  // trying to create subfolders for request.  If the audit and its folder link are already created
  //  we can do the request folder immediately.
  , create_request_folder : partial_proxy(
    create_folder, CMS.Models.Request, function(inst) { return inst.objective.reify().title; }, "audit")
  , "{CMS.Models.Request} created" : "link_request_to_new_folder_or_audit_folder"

  , link_request_to_new_folder_or_audit_folder : function(model, ev, instance) {
    if(instance instanceof CMS.Models.Request) {
      if(this._audit_create_in_progress || instance.audit.reify().object_folders.length < 1) {
        this.request_create_queue.push(instance);
      } else {
        if(instance.objective) {
          return instance.delay_resolving_save_until(this.create_request_folder(model, ev, instance));
        } else {

          if(Permission.is_allowed("create", "ObjectFolder", instance.context.id || null)) {

            return instance.delay_resolving_save_until(
              report_progress(
                'Linking new Request to Audit folder'
                , new CMS.Models.ObjectFolder({
                  folder_id : instance.audit.reify().object_folders[0].reify().folder_id
                  , folderable : instance
                  , context : instance.context || { id : null }
                }).save()
              )
            );
          } else {
            return $.when();
          }
        }
      }
    }
  }

  , resolve_permissions : function(folder, instance) {
    var permissions = {};
    var permission_dfds = [];
    var that = this;

    var push_person = function(role, email, queue_to_top) {
      if(!permissions[email] || permissions[email] !== "writer" || role !== "reader") {
        email = email.toLowerCase();
        permissions[email] = role;
        if(!that.user_permission_ids[email]) {
          if(queue_to_top) {
            permission_dfds.push(CMS.Models.GDriveFilePermission.findUserPermissionId(email).then(function(permissionId) {
              that.user_permission_ids[permissionId] = email;
              that.user_permission_ids[email] = permissionId;
            }));
          } else {
            return CMS.Models.GDriveFilePermission.findUserPermissionId(email).then(function(permissionId) {
              that.user_permission_ids[permissionId] = email;
              that.user_permission_ids[email] = permissionId;
            });
          }
        }
      }
    };

    can.each(permissions_by_type[instance.constructor.model_singular], function(role, key) {
      var people = instance[key];
      if(typeof people === "function") {
        people = people.call(instance);
      }
      can.each(!people || people.push ? people : [people], function(person) {
        if(person.person) {
          person = person.person;
        }
        person = person.reify();
        if(person.selfLink) {
          person = person.email;
          push_person(role, person, true);
        } else {
          permission_dfds.push(
            person.refresh()
            .then(function(p) { return p.email; })
            .then($.proxy(push_person, null, role))
          );
        }
      });
    });
    if(GGRC.config.GAPI_ADMIN_GROUP) {
      push_person("writer", GGRC.config.GAPI_ADMIN_GROUP, true);
    }
    if(instance instanceof CMS.Models.Program) {
      var auths = {};
      //setting user roles does create a quirk because we want to be sure that a user with
      //  access doesn't accidentally remove his own access to a resource while trying to change it.
      //  So a user may have more than one role at this point, and we only want to change the GDrive
      //  permission based on the most recent one.

      can.each(instance.get_mapping("authorizations"), function(authmapping) {
        var auth = authmapping.instance;
        if(!auths[auth.person.reify().email]
           || auth.created_at.getTime() > auths[auth.person.reify().email].created_at.getTime()
        ) {
          auths[auth.person.reify().email] = auth;
        }
      });
      can.each(auths, function(auth) {
        var person = auth.person.reify()
        , role = auth.role.reify()
        , rolesmap = {
          ProgramOwner : "writer"
          , ProgramEditor : "writer"
          , ProgramReader : "reader"
        };

        push_person(rolesmap[role.name], person.email, true);
      });
    }

    return $.when.apply($, permission_dfds).then(function() {
      return permissions;
    });
  }


  , update_permissions : function(model, ev, instance) {
    var dfd
    , that = this
    , permission_ids = {};

    if(!(instance instanceof model) || instance.__permissions_update_in_progress)
      return $.when();

    instance.__permissions_update_in_progress = true;

    // TODO check whether person is the logged-in user, and use OAuth2 identifier if so?
    return instance.get_binding("folders").refresh_instances().then(function(binding_list) {
      var binding_dfds = [];
      can.each(binding_list, function(binding) {
        binding_dfds.push($.when(
          that.resolve_permissions(binding.instance, instance)
          , binding.instance.findPermissions()
        ).then(function(permissions_to_create, permissions_to_delete) {
          var permissions_dfds = [];
          permissions_to_delete = can.map(permissions_to_delete, function(permission) {
            /* NB: GDrive sometimes provides the email address assigned to a permission and sometimes not.
               Email addresses will match on permissions that are sent outside of GMail/GApps/google.com
               while "Permission IDs" will match on internal account permissions (where email address is
               usually not provided).  Check both.
            */

            var email = permission.emailAddress
                        ? permission.emailAddress.toLowerCase()
                        : (permission.name && permission.domain
                          ? (permission.name + "@" + permission.domain)
                          : that.user_permission_ids[permission.id]);
            var pending_permission = permissions_to_create[email];

            // Case matrix.
            // 0: existing is owner -- delete existing and current.  Owner remains owner.
            // 1: pending (to create) does not exist, existing (to delete) exists -- do nothing, delete existing later
            // 2: pending exists, existing does not. -- we won't get here because we're iterating (do nothing, create pending later)
            // 3: pending and existing exist, have same role. -- delete both, do nothing later.
            // 4: pending and existing exist, pending is writer but existing is reader -- delete existing, create writer later.
            // 5: pending and existing exist, pending is reader but existing is writer -- do nothing, delete writer first.

            switch(true) {
            case (permission.role === "owner"):
              delete permissions_to_create[email];
              return;
            case (!pending_permission):
              return permission;
            case (pending_permission === permission.role):
              delete permissions_to_create[email];
              return;
            case (pending_permission !== "reader" && permission.role === "reader"):
              return;
            case (pending_permission === "reader" && permission.role !== "reader"):
              return permission;
            }

          });

          can.each(permissions_to_delete, function(permission) {
            permissions_dfds.push(report_progress(
              'Removing '
              + permission.role
              + ' permission on folder "'
              + binding.instance.title
              + '" for '
              + (that.user_permission_ids[permission.id]
                || permission.emailAddress
                || permission.value
                || (permission.name && permission.domain && (permission.name + "@" + permission.domain))
                || permission.id)
              , permission.destroy()
            ).then(null, function() {
              return new $.Deferred().resolve(); //wait on these even if they fail.
            }));
          });

          can.each(permissions_to_create, function(role, user) {
            permissions_dfds.push(
              that.update_permission_for(binding.instance, user, that.user_permission_ids[user], role)
              .then(null, function() {
                return new $.Deferred().resolve(); //wait on these even if they fail.
              })
            );
          });

          return $.when.apply($, permissions_dfds);
        }));
      });
      return $.when.apply($, binding_dfds);
    }).always(function() {
      delete instance.__permissions_update_in_progress;
    });
  }

  , update_permission_for : function(item, person, permissionId, role) {
    //short circuit any operation if the user isn't allowed to add permissions
    if(item.userPermission.role !== "writer" && item.userPermission.role !== "owner")
      return new $.Deferred().reject("User is not authorized to modify this object");

    if(person.email) {
      person = person.email;
    }

    return report_progress(
      'Creating ' + role + ' permission on folder "' + item.title + '" for ' + person
      , new CMS.Models.GDriveFolderPermission({
        folder : item
        , email : person
        , role : role
        , permission_type : person === GGRC.config.GAPI_ADMIN_GROUP ? "group" : "user"
      }).save()
    );
  }

  // extracted out of {Request updated} for readability.
  , move_files_to_new_folder : function(audit_folders, new_folder, audit_files, request_responses) {
    var tldfds = [];
    can.each(audit_files, function(file) {
      //if the file is still referenced in more than one request without an objective,
      // don't remove from the audit.
      tldfds.push(
        CMS.Models.ObjectDocument.findAll({
          "document.link" : file.alternateLink
        }).then(function(obds) {
          //filter out any object-documents that aren't Responses.
          var connected_request_responses = [], other_responses = [];
          var responses = can.map(obds, function(obd) {
            var dable = obd.documentable.reify();
            if(dable instanceof CMS.Models.Response) {
              if(~can.inArray(dable, request_responses)) {
                connected_request_responses.push(dable);
              } else {
                other_responses.push(dable);
              }
              return obd.documentable.reify();
            }
          });

          if(connected_request_responses.length > 0) {
            file.addToParent(new_folder);
            return new RefreshQueue().enqueue(other_responses).trigger().then(function(reified_responses) {
              var dfds = [];

              if(can.map(reified_responses, function(resp) {
                  if(!resp.request.reify().objective) {
                    return resp;
                  }
                }).length < 1
              ) {
                //If no other request is still using the Audit folder version,
                // remove from the audit folder.
                can.each(audit_folders, function(af) {
                  dfds.push(file.removeFromParent(af));
                });
              }

              return $.when.apply($, dfds);
            });
          }
        })
      );
    });

    report_progress(
      "Moving files to new Request folder"
      , $.when.apply($, tldfds)
    );
  }

  , move_files_to_audit_folder : function(instance, audit_folders, req_folders, files) {
    //move each file from the old Request folder to the Audit folders
    var move_dfds = [];
    can.each(files, function(file) {
      var parent_ids = can.map(file.parents, function(p) { return p.id; });
      move_dfds.push(file.addToParent(audit_folders[0]));
      can.each(req_folders, function(rf) {
        if(~can.inArray(rf.id, parent_ids)) {
          move_dfds.push(file.removeFromParent(req_folders[0]));
        }
      });
    });
    report_progress(
      "Moving files to the Audit folder"
      , $.when.apply($, move_dfds).done(function() {
        can.each(req_folders, function(rf) {
          if(!rf.selfLink || rf.userPermission.role !== "writer" && rf.userPermission.role !== "owner")
            return;  //short circuit any operation if the user isn't allowed to add permissions

          report_progress(
            'Checking whether folder "' + rf.title + '" is empty'
            , CMS.Models.GDriveFile.findAll({parents : rf.id}).then(function(orphs) {
              if(orphs.length < 1) {
                report_progress(
                  'Deleting empty folder "' + rf.title + '"'
                  , rf.destroy()
                );
              } else {
                console.warn("can't delete folder", rf.title, "as files still exist:", orphs);
              }
            })
          );
        });
      })
    );
    report_progress(
      'Linking Request to Audit folder'
      , new CMS.Models.ObjectFolder({
        folder_id : instance.audit.reify().object_folders[0].reify().folder_id
        , folderable : instance
        , context : instance.context || { id : null }
      }).save()
    );
  }

  , "{CMS.Models.Program} updated" : function(model, ev, instance) {
    if(instance instanceof CMS.Models.Program) {
      instance.delay_resolving_save_until(this.update_permissions(model, ev, instance));
    }
  }
  , "{CMS.Models.Audit} updated" : "update_audit_owner_permission"
  , update_audit_owner_permission : function(model, ev, instance){
    
    if(!(instance instanceof CMS.Models.Audit)) {
      return;
    }
    
    var dfd = instance.delay_resolving_save_until(this.update_permissions(model, ev, instance));
  }
  , "{CMS.Models.Request} updated" : "update_request_folder"

  , update_request_folder : function(model, ev, instance) {
    var that = this;
    if(!(instance instanceof CMS.Models.Request) || instance._folders_mutex) {
      return;
    }

    instance._folders_mutex = true;

    return instance.delay_resolving_save_until(
      $.when(
      instance.get_binding("folders").refresh_instances()
      , instance.audit.reify().get_binding("folders").refresh_instances()
    ).then(function(req_folders_mapping, audit_folders_mapping) {
      var audit_folder, af_index, obj_folder_to_destroy, obj_destroy_dfds;
      if(audit_folders_mapping.length < 1)
        return; //can't do anything if the audit has no folder
      //reduce the binding lists to instances only -- makes for easier comparison
      var req_folders =  can.map(req_folders_mapping, function(rf) { return rf.instance; });
      //Check whether or not the current user has permissions to modify the audit folder.
      var audit_folders = can.map(audit_folders_mapping, function(af) {
        if(!af.instance.selfLink || af.instance.userPermission.role !== "writer" && af.instance.userPermission.role !== "owner")
          return;  //short circuit any operation if the user isn't allowed to edit
        return af.instance;
      });

      if(audit_folders.length < 1) {
        return;  // no audit folder to work on, or none that the user can edit.
      }

      // check the array of request_folers against the array of audit_folders to see if there is a match.
      af_index = can.reduce(req_folders, function(res, folder) {
        return (res >= 0) ? res : can.inArray(folder, audit_folders);
      }, -1);

      if(af_index > -1 && instance.objective) {
        //we added an objective where previously there was not one.

        //First remove the mapping to the audit folder, else we could constantly revisit this process.
        audit_folder = audit_folders[af_index];
        obj_folder_to_destroy = req_folders_mapping[can.inArray(audit_folder, req_folders)].mappings[0].instance;

        return $.when(
          report_progress(
            'Linking Request "' + instance.objective.reify().title + '" to new folder'
            , new CMS.Models.GDriveFolder({
              title : instance.objective.reify().title
              , parents : audit_folders
            }).save().then(function(folder) {
              return new CMS.Models.ObjectFolder({
                folder : folder
                , folder_id : folder.id
                , folderable : instance
                , context : instance.context || { id : null }
              }).save().then(function() { return folder; });
            })
          )
          , CMS.Models.GDriveFile.findAll({parentfolderid : audit_folders[0].id})
          , instance.responses.reify()
          , obj_folder_to_destroy.refresh().then(function(of) { return of.destroy(); })
        ).then(
          that.proxy("move_files_to_new_folder", audit_folders)
          , function() {
            console.warn("a prerequisite failed", arguments[0]);
          }
        ).done(function() {
          that.update_permissions(model, ev, instance);
        });
      } else if(req_folders.length < 1) {
        return;
      } else if(af_index < 0 && !instance.objective) {
        //we removed the objective.  This is the easier case.
        obj_destroy_dfds = can.map(req_folders_mapping, function(b) {
          b.mappings[0].instance.refresh().then(function(of) { of.destroy(); });
          return CMS.Models.GDriveFile.findAll({parents : b.instance.id});
        });

        return $.when(
          CMS.Models.GDriveFile.findAll({parents : req_folders[0].id})
          , $.when.apply($, obj_destroy_dfds).then(function() {
            return can.unique(
              can.reduce(arguments, function(a, b) {
                return a.concat(b);
              }, [])
            );
          })
        ).then(
          that.proxy("move_files_to_audit_folder", instance, audit_folders, req_folders)
        ).done(function() {
          return that.update_permissions(model, ev, instance);
        });
      }
    }).always(function() {
      delete instance._folders_mutex;
    })
    );
  }

  , "a[data-toggle=gdrive-picker] click" : function(el, ev) {
    var response = CMS.Models.Response.findInCacheById(el.data("response-id"))
    , request = response.request.reify()
    , parent_folder = (request.get_mapping("folders")[0] || {}).instance;

    if(!parent_folder || !parent_folder.selfLink) {
      //no ObjectFolder or cannot access folder from GAPI
      el.trigger(
        "ajax:flash"
        , {
          warning : 'Can\'t upload: No GDrive folder found for PBC Request '
                  + request.objective ? ('"' + request.objective.reify().title + '"') : " with no title"
        });
      return;
    }
    //NB: resources returned from uploadFiles() do not match the properties expected from getting
    // files from GAPI -- "name" <=> "title", "url" <=> "alternateLink".  Of greater annoyance is
    // the "url" field from the picker differs from the "alternateLink" field value from GAPI: the
    // URL has a query parameter difference, "usp=drive_web" vs "usp=drivesdk".  For consistency,
    // when getting file references back from Picker, always put them in a RefreshQueue before
    // using their properties. --BM 11/19/2013
    parent_folder.uploadFiles().then(function(files) {
      return new RefreshQueue().enqueue(files).trigger().then(function(fs) {
        return $.when.apply($, can.map(fs, function(f) {
          if(!~can.inArray(parent_folder.id, can.map(f.parents, function(p) { return p.id; }))) {
            return f.copyToParent(parent_folder);
          } else {
            return f;
          }
        }));
      });
    }).done(function() {
      var files = can.makeArray(arguments);
      can.each(files, function(file) {
        //Since we can re-use existing file references from the picker, check for that case.
        CMS.Models.Document.findAll({link : file.alternateLink }).done(function(d) {
          if(d.length) {
            //file found, just link to Response
            report_progress(
              "Linking GGRC Evidence object for \"" + d[0].title + "\" to Response"
              , new CMS.Models.ObjectDocument({
                context : response.context || {id : null}
                , documentable : response
                , document : d[0]
              }).save()
            );
            CMS.Models.ObjectFile.findAll({ file_id : file.id, fileable : d[0] })
            .done(function(ofs) {
              if(ofs.length < 1) {
                report_progress(
                  "Linking Drive file \"" + file.title + "\" to GGRC Evidence object"
                  , new CMS.Models.ObjectFile({
                    context : response.context || {id : null}
                    , file : file
                    , fileable : d[0]
                  }).save()
                );
              }
            });
          } else {
            //file not found, make Document object.
            report_progress(
              "Creating GGRC Evidence for Drive file \"" + file.title + "\""
              , new CMS.Models.Document({
                context : response.context || {id : null}
                , title : file.title
                , link : file.alternateLink
              }).save()
            ).then(function(doc) {
              report_progress(
                "Linking GGRC Evidence object for \"" + doc.title + "\" to Response"
                , new CMS.Models.ObjectDocument({
                  context : response.context || {id : null}
                  , documentable : response
                  , document : doc
                }).save()
              );
              report_progress(
                "Linking Drive file \"" + file.title + "\" to GGRC Evidence object"
                , new CMS.Models.ObjectFile({
                  context : response.context || {id : null}
                  , file : file
                  , fileable : doc
                }).save()
              );
            });
          }
        });
      });
    });
  }
  , "a.create-folder click" : function(el, ev) {
    var data = el.closest("[data-model], :data(model)").data("model") || GGRC.make_model_instance(GGRC.page_object);
    this.create_folder_if_nonexistent(data);
  }
  , create_folder_if_nonexistent : function(object) {
    var dfd = object.get_binding("folders").refresh_instances()
    , that = this
    , parent_prop = {
      "Program" : null
      , "Audit" : "program"
      , "Request" : "audit"
    };
    // maybe we also need to create a parent folder if we don't already have a folder for this object.
    if(parent_prop[object.constructor.shortName] && !object.get_mapping("folders").length) {
      dfd = $.when(dfd, this.create_folder_if_nonexistent(object[parent_prop[object.constructor.shortName]].reify()));
    }
    return dfd.then(function foldercheck() {
      var folder_dfd;
      if(object.get_mapping("folders").length) {
        //assume we already tried refreshing folders.
      } else if(object instanceof CMS.Models.Request) {
        if(that._audit_create_in_progress || object.audit.reify().get_mapping("folders").length < 1) {
          that.request_create_queue.push(object);
        } else {
          that.link_request_to_new_folder_or_audit_folder(object.constructor, {}, object);
        }
      } else {
        folder_dfd = that["create_" + object.constructor.table_singular + "_folder"](object.constructor, {}, object);
        if(object instanceof CMS.Models.Audit) {
          folder_dfd.done(function(fld) {
            new RefreshQueue().enqueue(object.requests.reify()).trigger().done(function(reqs) {
              can.each(reqs, function(req) {
                if(!req.objective) {
                  new CMS.Models.ObjectFolder({
                    folderable : req
                    , folder : fld
                    , context : req.context
                  }).save();
                }
              });
            });
          });
        }
        return folder_dfd;
      }
    });
  }

  // FIXME I can't figure out from the UserRole what context it applies to.  Assuming that we are on
  //  the program page and adding ProgramReader/ProgramEditor/ProgramOwner.
  , "{CMS.Models.UserRole} created" : function(model, ev, instance) {
    var cache, that = this;
    if(instance instanceof CMS.Models.UserRole
       && instance.context // Only proceed if not the common context
       && /^Program|^Auditor/.test(instance.role.reify().name)
    ) {
      cache = /^Program/.test(instance.role.reify().name) ? CMS.Models.Program.cache : CMS.Models.Audit.cache;

      if (!cache)
        return;

      can.each(Object.keys(cache), function(key) {
        var dfd = new $.Deferred();
        if(cache[key].context && cache[key].context.id === instance.context.id) {
          //delay this because the user role isn't updated in the object yet.
          instance.delay_resolving_save_until(dfd);
          setTimeout(function() {
            that.update_permissions(
              cache[key].constructor
              , ev
              , cache[key]
            ).always($.proxy(dfd, "resolve"));
          }, 10);
        }
      });
    }
  }
  , "a.show-meeting click" : function(el, ev){
    var instance = el.closest("[data-model], :data(model)").data("model")
      , cev = el.closest("[data-model], :data(cev)").data("cev")
      , subwin;
    function poll() {
      if(!subwin) {
        return; //popup blocker didn't allow a reference to the open window.
      } else if(subwin.closed) {
        cev.refresh().then(function() {
          instance.attr({
            title : cev.summary
            , start_at : cev.start
            , end_at : cev.end
          });
          can.each(instance.get_mapping("people"), function(person_binding) {
            instance.mark_for_deletion("people", person_binding.instance);
          });
          can.each(cev.attendees, function(attendee) {
            instance.mark_for_addition("people", attendee);
          });
          instance.save();
        });
      } else {
        setTimeout(poll, 5000);
      }
    }
    subwin = window.open(cev.htmlLink, cev.summary);
    setTimeout(poll, 5000);
  }
  , create_meeting : function(instance){
    
    new CMS.Models.GCalEvent({
      calendar : GGRC.config.DEFAULT_CALENDAR
      , summary : instance.title
      , start : instance.start_at
      , end : instance.end_at
      , attendees : can.map(instance.get_mapping("people"), function(m) { return m.instance; })
    }).save().then(function(cev) {
      
      new CMS.Models.ObjectEvent({
        eventable : instance
        , calendar : GGRC.config.DEFAULT_CALENDAR
        , event : cev
        , context : instance.context || { id : null }
      }).save();
    });
  }
  , "{CMS.Models.Meeting} created" : function(model, ev, instance) {
    if(instance instanceof CMS.Models.Meeting) {
      this.create_meeting(instance);
    }
  }
  , "a.create-meeting click" : function(el, ev){
    var instance = el.closest("[data-model], :data(model)").data("model");
    this.create_meeting(instance);
  }
});

$(function() {
  $(document.body).ggrc_controllers_g_drive_workflow();
});

})(this.can, this.can.$);
