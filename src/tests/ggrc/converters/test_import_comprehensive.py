# Copyright (C) 2015 Google Inc., authors, and contributors <see AUTHORS file>
# Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
# Created By: miha@reciprocitylabs.com
# Maintained By: miha@reciprocitylabs.com

import random
import os
from os.path import abspath
from os.path import dirname
from os.path import join
from flask import json

from ggrc import db
from ggrc.models import Program
from ggrc_basic_permissions import Role
from ggrc_basic_permissions import UserRole
from tests.ggrc import TestCase
from tests.ggrc.generator import ObjectGenerator

THIS_ABS_PATH = abspath(dirname(__file__))
CSV_DIR = join(THIS_ABS_PATH, 'test_csvs/')


if os.environ.get("TRAVIS", False):
  random.seed(1)  # so we can reproduce the tests if needed


class TestComprehensiveSheets(TestCase):

  """
  test sheet from:
    https://docs.google.com/spreadsheets/d/1Jg8jum2eQfvR3kZNVYbVKizWIGZXvfqv3yQpo2rIiD8/edit#gid=0

  """

  def setUp(self):
    TestCase.setUp(self)
    self.generator = ObjectGenerator()
    self.client.get("/login")
    pass

  def tearDown(self):
    pass

  def test_comprehensive_sheet1_with_custom_attributes(self):
    self.create_custom_attributes()
    self.create_people()
    filename = "comprehensive_sheet1.csv"
    response = self.import_file(filename)
    indexed = {r["name"]: r for r in response}

    expected = {
        "Control": {
            "created": 14,
            "ignored": 2,
            "row_errors": 2,
            "row_warnings": 3,
            "rows": 16,
        },
        "Objective": {
            "created": 8,
            "ignored": 7,
            "row_errors": 5,
            "row_warnings": 4,
            "rows": 15,
        },
        "Program": {
            "created": 13,
            "ignored": 3,
            "row_errors": 3,
            "row_warnings": 4,
            "rows": 16,
        },
        "Issue": {
            "created": 10,
            "ignored": 4,
            "row_errors": 4,
            "row_warnings": 4,
            "rows": 14,
        },
        "Policy": {
            "created": 13,
            "ignored": 3,
            "row_errors": 3,
            "row_warnings": 4,
            "rows": 16,
        },
        "Regulation": {
            "created": 13,
            "ignored": 2,
            "row_errors": 3,
            "row_warnings": 3,
            "rows": 15,
        },
        "Standard": {
            "created": 14,
            "ignored": 2,
            "row_errors": 3,
            "row_warnings": 5,
            "rows": 16,
        },
        "Contract": {
            "created": 14,
            "ignored": 2,
            "row_errors": 3,
            "row_warnings": 4,
            "rows": 16,
        },
        "System": {
            "created": 14,
            "ignored": 2,
            "row_errors": 3,
            "row_warnings": 4,
            "rows": 16,
        },
        "Clause": {
            "created": 14,
            "ignored": 2,
            "row_errors": 2,
            "row_warnings": 4,
            "rows": 16,
        },
        "Process": {
            "created": 14,
            "ignored": 2,
            "row_errors": 3,
            "row_warnings": 4,
            "rows": 16,
        },
        "Data Asset": {
            "created": 14,
            "ignored": 2,
            "row_errors": 3,
            "row_warnings": 4,
            "rows": 16,
        },
        "Product": {
            "created": 14,
            "ignored": 2,
            "row_errors": 3,
            "row_warnings": 4,
            "rows": 16,
        },
        "Project": {
            "created": 8,
            "ignored": 0,
            "row_errors": 0,
            "row_warnings": 0,
            "rows": 8,
        },
        "Facility": {
            "created": 14,
            "ignored": 2,
            "row_errors": 3,
            "row_warnings": 4,
            "rows": 16,
        },
        "Market": {
            "created": 13,
            "ignored": 2,
            "row_errors": 3,
            "row_warnings": 3,
            "rows": 15,
        },
        "Org Group": {
            "created": 13,
            "ignored": 2,
            "row_errors": 3,
            "row_warnings": 3,
            "rows": 15,
        },
        "Vendor": {
            "created": 13,
            "ignored": 2,
            "row_errors": 3,
            "row_warnings": 3,
            "rows": 15,
        },
        "Person": {
            "created": 9,
            "ignored": 1,
            "row_errors": 1,
            "row_warnings": 0,
            "rows": 10,
        }
    }

    # general numbers check
    for name, data in expected.items():
      current = indexed[name]
      self.assertEquals(current["rows"], data["rows"], name)
      self.assertEquals(current["ignored"], data["ignored"], name)
      self.assertEquals(current["created"], data["created"], name)
      self.assertEquals(len(current["row_errors"]), data["row_errors"], name)
      self.assertEquals(
          len(current["row_warnings"]), data["row_warnings"], name)

    prog = Program.query.filter_by(slug="prog-8").first()
    self.assertTrue(prog.private)
    self.assertEquals(prog.title, "program 8")
    self.assertEquals(prog.status, "Draft")
    self.assertEquals(prog.description, "test")

    custom_vals = [v.attribute_value for v in prog.custom_attribute_values]
    expected_custom_vals = ['0', 'a', '2015-12-12 00:00:00', 'test1']
    self.assertEquals(set(custom_vals), set(expected_custom_vals))

  def test_full_good_import_no_warnings(self):
    filename = "full_good_import_no_warnings.csv"
    response = self.import_file(filename)
    messages = ("block_errors", "block_warnings", "row_errors", "row_warnings")

    for message in messages:  # response[0] = Person block
      self.assertEquals(response[0][message], [])
    ggrc_admin = db.session.query(Role.id).filter(Role.name == "gGRC Admin")
    reader = db.session.query(Role.id).filter(Role.name == "Reader")
    creator = db.session.query(Role.id).filter(Role.name == "Creator")
    ggrc_admins = UserRole.query.filter(UserRole.role_id == ggrc_admin).all()
    readers = UserRole.query.filter(UserRole.role_id == reader).all()
    creators = UserRole.query.filter(UserRole.role_id == creator).all()
    self.assertEquals(len(ggrc_admins), 12)
    self.assertEquals(len(readers), 5)
    self.assertEquals(len(creators), 6)

    for block in response:
      self.assertEquals(set(), set(block["block_errors"]))
      self.assertEquals(set(), set(block["block_warnings"]))
      self.assertEquals(set(), set(block["row_errors"]))
      self.assertEquals(set(), set(block["row_warnings"]))

  def create_custom_attributes(self):
    gen = self.generator.generate_custom_attribute
    gen("control", title="my custom text", mandatory=True)
    gen("program", title="my_text", mandatory=True)
    gen("program", title="my_date", attribute_type="Date")
    gen("program", title="my_checkbox", attribute_type="Checkbox")
    gen("program", title="my_dropdown", attribute_type="Dropdown",
        options="a,b,c,d")
    # gen("program", title="my_description", attribute_type="Rich Text")

  def create_people(self):
    emails = [
        "user1@ggrc.com",
        "miha@policy.com",
        "someone.else@ggrc.com",
        "another@user.com",
    ]
    for email in emails:
      self.generator.generate_person({
          "name": email.split("@")[0].title(),
          "email": email,
      }, "gGRC Admin")

  def import_file(self, filename, dry_run=False):
    data = {"file": (open(join(CSV_DIR, filename)), filename)}
    headers = {
        "X-test-only": "true" if dry_run else "false",
        "X-requested-by": "gGRC",
    }
    response = self.client.post("/_service/import_csv",
                                data=data, headers=headers)
    self.assert200(response)
    return json.loads(response.data)