function "example" {
  input {
  }

  stack {
    var $c_false__fenced {
      value = ```
        {
          lead: false
          next: 30
          tail: "end"
        }
        ```
    }
    var $c_text__fenced {
      value = ```
        {
          lead: "probe"
          next: 30
          tail: "end"
        }
        ```
    }
    var.update $c_zero_var__fenced {
      value = ```
        {
          lead: $zero_var
          next: 30
          tail: "end"
        }
        ```
    }
    var $c_comma__fenced {
      value = ```
        {
          lead: 7,
          next: 30,
          tail: "end"
        }
        ```
    }
    var $c_reordered__fenced {
      value = ```
        {
          next: 30
          tail: "end"
          lead: 0
        }
        ```
    }
    var $c_list__fenced {
      value = ```
        {
          lead: []
          next: 30
          tail: "end"
        }
        ```
    }
    foreach ($items) {
      each as $item {
        var $deep {
          value = ```
            {
              lead: []
              next: 30
              tail: "end"
            }
            ```
        }
      }
    }
    var $c_array__fenced {
      value = ```
        [
          1
          2
        ]
        ```
    }
    function.run "Orders/dispatch" {
      input = ```
        {
          lead: true
          next: 30
          tail: "end"
        }
        ```
    } as $dispatch
    return ```
      {
        ok: true
      }
      ```
  }

  response = $dispatch
}