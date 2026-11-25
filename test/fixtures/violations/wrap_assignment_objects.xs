function "example" {
  input {
  }

  stack {
    function.run "Orders/dispatch" {
      input = {k: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
      mock = {ok: 1}
    } as $dispatch
    var $summary {
      value = {k: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
    }
  }

  response = $summary
}