function "example" {
  input {
  }

  stack {
  }

  response = $ok

  test widget_reindex {
    input = {}
  }

  tags = ["domain:widgets"]
  guid = "g1"
}