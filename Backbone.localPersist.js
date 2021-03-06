/**
 * Backbone localStorage and sessionStorage Adapter
 * 
 */
(function (root, factory) {
  if (typeof exports === 'object' && typeof require === 'function') {
    module.exports = factory(require("backbone"),require("underscore"),require('jquery'));
  } else if (typeof define === "function" && define.amd) {
    // AMD. Register as an anonymous module.
    define(["backbone","underscore","jquery"], function(Backbone,_) {
      // Use global variables if the locals are undefined.
      return factory(Backbone || root.Backbone,_,$);
    });
  } else {
    factory(Backbone,_);
  }
}(this, function(Backbone,_,$) {
  var storageIsAvailable = true;
  try{
    if(typeof window.localStorage !== 'undefined') {
      window.localStorage.setItem('storageIsAvailable','test');
      window.localStorage.removeItem('storageIsAvailable');
    }
  }catch(err){
    storageIsAvailable = false;
  }
  if (!storageIsAvailable
    || typeof window.localStorage === 'undefined'
    || typeof window.sessionStorage === 'undefined'){
    throw("Envoirment does not support localStorage");    
  }

  var storageTypes =  {"local":1,"session":2 };
  
  function result(object, property) {
    if (object == null) return void 0;
    var value = object[property];
    return (typeof value === 'function') ? object[property]() : value;
  }

  //generate guid
  function guid(){
    var d = Date.now();
    if(window.performance && typeof window.performance.now === 'function'){
        d += performance.now();
    }
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (d + Math.random()*16)%16 | 0;
        d = Math.floor(d/16);
        return (c=='x' ? r : (r&0x3|0x8)).toString(16);
    });
    return uuid;
  }
  
  Backbone.localPersist = function(name, sessionStorage) {
    this.name =  typeof name === 'function' ? name() : name;
    this.storageType = (typeof sessionStorage != "undefined" && sessionStorage == true) 
                        ? storageTypes.session : storageTypes.local;
    var store = this.getStorage().getItem(this.name) || '';
    this.records = (store && store.split(',')) || [];
  }
  
  _.extend(Backbone.localPersist.prototype, {

    save: function() {
      this.getStorage().setItem(this.name, this.records.join(","));
    },

    safeGet: function(name) { 
      var obj = this.getStorage().getItem(name); 
      if (!obj) {
        return '{}';
      }
      return obj;
    },

    // Add a model, giving it a (hopefully)-unique GUID, if it doesn't already
    // have an id of it's own.
    create: function(model) {
      if (!model.id) {
          model.id = guid();
          model.set(model.idAttribute, model.id);
      }
      this.getStorage().setItem(this.name+"-"+model.id, JSON.stringify(model));
      this.records.push(model.id.toString());
      this.save();
      return model.toJSON();
    },

    // Update a model by replacing its copy in `this.data`.
    update: function(model) {
      this.getStorage().setItem(this.name+"-"+model.id, JSON.stringify(model));
      if (!_.include(this.records, model.id.toString())) this.records.push(model.id.toString()); this.save();
      return model.toJSON();
    },

    // Retrieve a model from `this.data` by id.
    find: function(model) {
      return JSON.parse(this.safeGet(this.name+"-"+model.id));
    },

    // Return the array of all models currently in storage.
    findAll: function() {
      return _(this.records).chain()
          .map(function(id){
            var obj = JSON.parse(this.safeGet(this.name+"-"+id));
            return _.isEmpty(obj) ? false : obj;
          }, this)
          .compact()
          .value();
    },

    // Delete a model from `this.data`, returning it.
    destroy: function(model) {
      this.getStorage().removeItem(this.name+"-"+model.id);
      this.records = _.reject(this.records, function(record_id){return record_id == model.id.toString();});
      this.save();
      return model;
    },

    getStorage: function() {
      var storage;
      if(this.storageType === storageTypes.local){
        storage = this._localStorage();
      } else {
        storage = this._sessionStorage();
      }
      return storage;
    },
    
    _localStorage: function(){
      return localStorage;
    },
    
    _sessionStorage: function(){
      return sessionStorage;
    },
    
    _clear: function() {
      var local = this.getStorage(),
        itemRe = new RegExp("^" + this.name + "-");

      // Remove id-tracking item (e.g., "foo").
      local.removeItem(this.name);

      // Match all data items (e.g., "foo-ID") and remove.
      for (var k in local) {
        if (itemRe.test(k)) {
          local.removeItem(k);
        }
      }

      this.records.length = 0;
    }
    
  });
  
  // localSync delegate to the model or collection's
  // *localStorage* property, which should be an instance of `Store`.
  Backbone.localPersist.sync = function(method, model, options, error) {
    var store = model.localPersist || model.collection.localPersist,
      resp,
      error = "Record not found",
      syncDfd = Backbone.$ ?
        (Backbone.$.Deferred && Backbone.$.Deferred()) :
        (Backbone.Deferred && Backbone.Deferred());

    // Backwards compatibility with Backbone <= 0.3.3
    if (typeof options == 'function') {
      options = {
        success: options,
        error: error
      };
    }

    try {

      switch (method) {
        case "read":    resp = model.id != undefined ? store.find(model) : store.findAll(); break;
        case "create":  resp = store.create(model);                            break;
        case "update":  resp = store.update(model);                            break;
        case "delete":  resp = store.destroy(model);                           break;
      }

    } catch (e) { error = e; }

    if (resp) {
      options.success(resp);
      if (syncDfd) {
        syncDfd.resolve();
      }
    } else {
      options.error("Record not found");
      if (syncDfd) {
        syncDfd.reject();
      }
    }

    return syncDfd && syncDfd.promise();
  };
  Backbone.ajaxSync = Backbone.sync;

  Backbone.getSyncMethod = function(model,args) {
    if((model.localPersist && !model.disableLocalPersist && model.syncLocal) 
    || (model.collection && model.collection.localPersist && !model.collection.disableLocalPersist)) {
      Backbone.localPersist.sync.apply(this,args);
    }
    
    if((model && model.disableAjaxSync !== undefined && !model.disableAjaxSync) 
    || (model.collection && model.collection.disableAjaxSync !== undefined && !model.collection.disableAjaxSync)){
      Backbone.ajaxSync.apply(this,args);
    }
  };

  // Override 'Backbone.sync' to default to localSync,
  // the original 'Backbone.sync' is still available in 'Backbone.ajaxSync'
  Backbone.sync = function(method, model, options, error) {
    if(result(model,"localPersist") || result(model.collection,"localPersist")){
      return Backbone.getSyncMethod(model,[method, model, options, error]);
    }
    return Backbone.ajaxSync.apply(this,[method,model,options,error]);
  };
  return Backbone.localPersist;
}));