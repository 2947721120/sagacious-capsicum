# Copyright (C) 2013 Google Inc., authors, and contributors <see AUTHORS file>
# Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
# Created By: david@reciprocitylabs.com
# Maintained By: david@reciprocitylabs.com

import sys

def view_service_for(obj):
  module = sys.modules['ggrc.views']
  if type(obj) is str or type(obj) is unicode:
    model_type = obj
  else:
    model_type = obj.__class__.__name__
  return getattr(module, model_type, None)

def view_url_for(obj, id=None):
  service = view_service_for(obj)
  if service is None:
    return None
  if id:
    return service.url_for(id=id)
  return service.url_for(obj)
