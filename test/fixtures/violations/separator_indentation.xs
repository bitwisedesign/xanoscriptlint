function "example" {
  input {
  }
  
  stack {
    var $ok {
      value = 1
    }

    var $next {
      value = 2
    }
  }

  response = $ok
}