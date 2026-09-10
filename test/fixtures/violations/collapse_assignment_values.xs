function "example" {
  input {
  }

  stack {
    function.run "Orders/dispatch" {
      input = {
        k: "x"
      }
    } as $dispatch
  }

  response = $dispatch
}