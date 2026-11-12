function "example" {
  input {
  }

  stack {
    var $long {
      value = ```
        {
          k: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        }
        ```
    }
    var $ternary {
      value = ```
        $job == null ? null : {ok: true}
        ```
    }
    var.update $failures {
      value = $failures
        |push:```
          {errors: []}
          ```
    }
    db.query item {
      mock = {
        "checkout applies gift wrap": ```
          {
            id: 12
          }
          ```
      }
    } as $item
    var $commented {
      value = ```
        {
          // keep this fenced
          k: 1
        }
        ```
    }
    var $piped {
      value = ```
        {
          k: 1
        }
        ```|first
    }
    var $c_zero__fenced {
      value = ```
        {
          lead: 0
          next: 30
          tail: "end"
        }
        ```
    }
  }

  response = $item
}