function "example" {
  input {
    enum lane {
      values = ["alpha", "bravo", "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"]
    }
  }

  stack {
  }

  response = $ok
}