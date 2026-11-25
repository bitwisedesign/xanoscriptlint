function "example" {
  input {
  }

  stack {
    var $fenced_zero {
      value = {lead: 0, next: 30, tail: "end"}
    }
    var.update $fenced_no_zero {
      value = {lead: false, next: 30}
    }
    var $native_multiline {
      value = {allowed: false, used: 0, limit: 30}|set:"window_seconds":600|set:"retry_after_seconds":0
    }
    var $oneline_64 {
      value = {lead: 0, next: 30}|set:"tail":"xxxxxxxxxxxxxxxxxxxxxxxxxx"
    }
    var $zero_dot {
      value = {lead: 0.0, next: 30}
    }
    var $list_field {
      value = {lead: 0}|set:"items":["xxxxxxxxxxxxxxxxxxxxxxxxxxx"]|set:"next":30
    }
    var $input_key {
      value = {id: $input.key, used: 0}|set:"extra":"xxxxxxxxxxxxxxxxxxx"
    }
    var $filter_field {
      value = {
        lead: 0
        next: $items|count
        tail: "xxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
    var $empty_seed {
      value = {}
        |set:"items":[1, 2, 3, "xxxxxxxxxxxxxxxxxxxx"]
        |set:"used":0
        |set:"limit":30
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