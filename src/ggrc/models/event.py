# Copyright (C) 2013 Google Inc., authors, and contributors <see AUTHORS file>
# Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
# Created By: vraj@reciprocitylabs.com
# Maintained By: vraj@reciprocitylabs.com

from ggrc import db
from .mixins import Base, created_at_args

class Event(Base, db.Model):
  __tablename__ = 'events'

  action = db.Column(db.Enum(u'POST', u'PUT', u'DELETE', u'IMPORT'), nullable = False)
  resource_id = db.Column(db.Integer)
  resource_type = db.Column(db.String)

  revisions = db.relationship('Revision', backref='event', cascade='all, delete-orphan')

  _publish_attrs = [
      'action',
      'resource_id',
      'resource_type',
      'revisions',
  ]

  @classmethod
  def eager_query(cls):
    from sqlalchemy import orm

    query = super(Event, cls).eager_query()
    return query.options(
        orm.undefer_group('Revision_complete'),
        orm.subqueryload('revisions'))
