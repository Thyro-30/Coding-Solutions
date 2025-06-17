if __name__ == '__main__':
    N = int(input())  # Read number of commands
    my_list = []  # Use a safe variable name instead of `list`

    for _ in range(N):
        command = input().split()  # Read and split command input
        if command[0] == "insert":
            my_list.insert(int(command[1]), int(command[2]))  # Corrected insert syntax
        elif command[0] == "print":
            print(my_list)
        elif command[0] == "remove":
            my_list.remove(int(command[1]))  # Remove the first occurrence of the value
        elif command[0] == "append":
            my_list.append(int(command[1]))  # Append an integer
        elif command[0] == "sort":
            my_list.sort()  # Sort the list
        elif command[0] == "pop":
            if my_list:  # Ensure the list is not empty before popping
                my_list.pop()
        elif command[0] == "reverse":
            my_list.reverse()  # Reverse the list
