function "example" {
  input {
  }

  stack {
    if ($row.is_active) {
      var $ok {
        value = 1
      }
    }
    elseif ($row.is_ready && $row.is_open == false) {
      var $ready {
        value = 1
      }
    }
    if ($row.flag != true) {
      var $skipped {
        value = 1
      }
    }
  }

  response = $ok
}