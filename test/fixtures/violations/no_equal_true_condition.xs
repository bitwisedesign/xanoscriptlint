function "example" {
  input {
  }

  stack {
    if ($row.is_active == true) {
      var $ok {
        value = 1
      }
    }
    elseif ($row.is_ready == true && $row.is_open == false) {
      var $ready {
        value = 1
      }
    }
  }

  response = $ok
}