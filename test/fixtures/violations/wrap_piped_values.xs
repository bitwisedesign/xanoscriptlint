function "example" {
  input {
  }

  stack {
    var $order {
      value = {}|set:"cart_uuid":$cart_uuid|set:"reason":$reject_reason
    }
  }

  response = $order
}
