function "example" {
  input {
  }

  stack {
    var $auth {
      value = 1
    }
    var.update $env {
      value = 2
    }
    db.query "user" {
      output = ["id"]
    } as $output
    foreach ($items) {
      each as $this {
        debug.log {
          value = $auth.id
        }
      }
    }
  }

  response = $ok
}