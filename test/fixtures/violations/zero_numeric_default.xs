function "example" {
  input {
    int retry_count?=0
    decimal offset?=0.0
  }

  stack {
  }

  response = $ok
}