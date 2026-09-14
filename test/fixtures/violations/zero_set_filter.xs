function "example" {
  input {
  }

  stack {
    var $tally {
      value = {}|set:"slot":0
    }
  }

  response = $tally
}