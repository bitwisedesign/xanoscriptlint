// Clean example
function "example" {
  input {
    int page?=1
    decimal weight?=1
    int quantity?="-1"
  }

  stack {
    var $ok {
      value = 1
    }
    db.query item {
      mock = {
        "checkout short"                : {id: 1}
        "checkout longest_scenario_name": {id: 2}
      }
    }
  }

  response = $ok
}