function "example" {
  input {
    enum shipping_speed?="standard" {
      values = ["standard", "express"]
    }
  }

  stack {
  }

  response = $ok
}
