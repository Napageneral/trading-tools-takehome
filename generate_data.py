
import random

random.seed(42)

current_time = 1721395800000000000
increment_tick = 1000
value = 0

file = open("data.csv", "w")
file.write("Timestamp,Value\n")

for _ in range(10_000_000):
    if (random.random() > 0.01):
        if random.random() > 0.5:
            increment_tick = 1000
        else:
            increment_tick = 10000000

    current_time += increment_tick
    value += random.randint(-10, 10)
    file.write(str(current_time) + "," + str(value) + "\n")