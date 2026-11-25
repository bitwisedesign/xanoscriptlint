function "example" {
  input {
  }

  stack {
    var $short_oneline {
      value = {lead: 0, next: 30, tail: "xxxxxxxxxxxxxxxxxxxxxxxxx"}
    }
    var $zero_last {
      value = {
        next: 30
        tail: "end"
        lead: 0
      }
    }
    var $false_then_key {
      value = {
        lead: false
        next: 30
      }
    }
    var $fenced_array {
      value = ```
        [
          1
          2
        ]
        ```
    }
    var $fenced_ternary {
      value = ```
        $job == null ? null : {ok: true}
        ```
    }
    db.query item {
      mock = {
        "checkout applies gift wrap": ```
          {
            lead: 0
            next: 30
          }
          ```
      }
    } as $item
    db.add job {
      data = {
        issued_count        : 0
        already_issued_count: 0
        skipped_count       : 0
      }
    }
    debug.log {
      value = {
        lead: 0
        next: 30
      }
    }
  }

  response = $item

  test "keeps fenced input" {
    input = ```
      {
        lead: 0
        next: 30
      }
      ```
  }
}