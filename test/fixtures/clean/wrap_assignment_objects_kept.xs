function "example" {
  input {
  }

  stack {
    function.run "Orders/dispatch" {
      input = {k: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
      mock = {ok: 1}
    } as $dispatch
    var $summary {
      value = {k: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
    }
  }

  response = $summary
}