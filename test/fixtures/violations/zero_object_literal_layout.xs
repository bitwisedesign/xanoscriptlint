function "example" {
  input {
  }

  stack {
    var $fenced_zero {
      value = ```
        {
          lead: 0
          next: 30
          tail: "end"
        }
        ```
    }
    var.update $fenced_no_zero {
      value = ```
        {
          lead: false
          next: 30
        }
        ```
    }
    var $native_multiline {
      value = {
        allowed            : false
        used               : 0
        limit              : 30
        window_seconds     : 600
        retry_after_seconds: 0
      }
    }
    var $oneline_64 {
      value = {lead: 0, next: 30, tail: "xxxxxxxxxxxxxxxxxxxxx"}
    }
    var $zero_dot {
      value = {
        lead: 0.0
        next: 30
      }
    }
    var $list_field {
      value = {
        lead : 0
        items: ["xxxxxxxxxxxxxxxxxxxxxxxxxxx"]
        next : 30
      }
    }
    var $input_key {
      value = {
        id   : $input.key
        used : 0
        extra: "xxxxxxxxxxxxxx"
      }
    }
    var $filter_field {
      value = {
        lead: 0
        next: $items|count
        tail: "xxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
    var $empty_seed {
      value = {
        items: [1, 2, 3, "xxxxxxxxxxxxxxxxxxxx"]
        used : 0
        limit: 30
      }
    }
  }

  response = $ok

  test "probe fenced expect" {
    input = {id: 1}
    expect.to_equal ($response.result) {
      value = ```
        {
          lead: 0
          next: 30
        }
        ```
    }
  }
}