function "example" {
  input {
  }

  stack {
    db.transaction {
      stack {
      // create the widget
      db.add widget {
        data = {id: $id}
      }
    }
    }
  }

  response = $widget
}