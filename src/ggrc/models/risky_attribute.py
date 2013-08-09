# Copyright (C) 2013 Google Inc., authors, and contributors <see AUTHORS file>
# Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
# Created By:
# Maintained By: vraj@reciprocitylabs.com

from ggrc import db
from .associationproxy import association_proxy
from .mixins import deferred, BusinessObject, Timeboxed
from .object_document import Documentable
from .object_person import Personable

class RiskyAttribute(Documentable, Personable, Timeboxed, BusinessObject, db.Model):
  __tablename__ = 'risky_attributes'

  type_string = deferred(db.Column(db.String), 'RiskyAttribute')

  risk_risky_attributes = db.relationship(
      'RiskRiskyAttribute', backref='risky_attribute', cascade='all, delete-orphan')
  risks = association_proxy('risk_risky_attributes', 'risk', 'Risk')

  _publish_attrs = [
      'type_string',
      'risk_risky_attributes',
      'risks',
      ]

  @classmethod
  def eager_query(cls):
    from sqlalchemy import orm

    query = super(RiskyAttribute, cls).eager_query()
    return query.options(
        orm.subqueryload_all('risk_risky_attributes.risk'))
