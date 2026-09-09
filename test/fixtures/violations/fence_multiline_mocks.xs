function "example" {
  input {
  }

  stack {
    db.query item {
      mock = {
        "checkout applies gift wrap": {
          issued              : []
          already_issued      : []
          skipped             : []
          failed              : []
          issued_count        : 0
          already_issued_count: 0
          skipped_count       : 0
          failed_count        : 0
        }
      }
    }
  }

  response = $item
}