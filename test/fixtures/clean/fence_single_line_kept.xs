function "example" {
  input {
  }

  stack {
    db.query item {
      mock = {
        "checkout applies gift wrap": ```
          {
            id: 12
          }
          ```
        empty: ```
        ```
        noted: ```
          // keep this fenced
          ```
      }
    }
    function.run "Orders/dispatch" {
      input = {
        payload: ```
          {
            id: 12
          }
          ```
      }
    } as $dispatch
    var $row {
      value = ```
        {id: 1}
        ```
    }
    var.update $failures {
      value = $failures
        |push:```
          {errors: []}
          ```
    }
  }

  response = ```
    $ok == null ? null : {ok: true}
    ```
}
